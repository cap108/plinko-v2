import type Database from 'better-sqlite3';
import type { AdminSessionEntry, AdminSessionDetailResponse, AdminStatsResponse } from '@plinko-v2/shared';
import { logger } from '../logger.js';

export class AdminStore {
  private db: Database.Database;
  private stmts: {
    getConfigValue: Database.Statement;
    setConfigValue: Database.Statement;
    getAllConfig: Database.Statement;
    deleteConfigValue: Database.Statement;
    insertAuditLog: Database.Statement;
    listSessions: Database.Statement;
    countSessions: Database.Statement;
    countActiveSessions: Database.Statement;
    getSessionWithRoundCount: Database.Statement;
    getSessionHistory: Database.Statement;
    deleteSession: Database.Statement;
    resetSessionBalance: Database.Statement;
    globalStats: Database.Statement;
    statsByPaytable: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.db = db;
    this.stmts = {
      getConfigValue: db.prepare(`SELECT value FROM admin_config WHERE key = ?`),
      setConfigValue: db.prepare(
        `INSERT OR REPLACE INTO admin_config (key, value, updated_at) VALUES (?, ?, ?)`
      ),
      getAllConfig: db.prepare(`SELECT key, value FROM admin_config`),
      deleteConfigValue: db.prepare(`DELETE FROM admin_config WHERE key = ?`),
      insertAuditLog: db.prepare(
        `INSERT INTO admin_audit_log (action, detail, ip_hash, timestamp) VALUES (?, ?, ?, ?)`
      ),
      listSessions: db.prepare(
        `SELECT s.session_id, s.balance_cents, s.created_at, s.last_active_at,
                s.created_by_ip_hash, COUNT(h.id) as round_count
         FROM sessions s
         LEFT JOIN history h ON s.session_id = h.session_id
         GROUP BY s.session_id
         ORDER BY s.last_active_at DESC
         LIMIT ? OFFSET ?`
      ),
      countSessions: db.prepare(`SELECT COUNT(*) as count FROM sessions`),
      countActiveSessions: db.prepare(
        `SELECT COUNT(*) as count FROM sessions WHERE last_active_at > ?`
      ),
      getSessionWithRoundCount: db.prepare(
        `SELECT s.session_id, s.balance_cents, s.created_at, s.last_active_at,
                s.created_by_ip_hash, COUNT(h.id) as round_count
         FROM sessions s
         LEFT JOIN history h ON s.session_id = h.session_id
         WHERE s.session_id = ?
         GROUP BY s.session_id`
      ),
      getSessionHistory: db.prepare(
        `SELECT round_id, bet_cents, rows, risk_level, slot_index, multiplier,
                win_cents, balance_cents, timestamp
         FROM history WHERE session_id = ?
         ORDER BY timestamp DESC LIMIT ?`
      ),
      deleteSession: db.prepare(`DELETE FROM sessions WHERE session_id = ?`),
      resetSessionBalance: db.prepare(
        `UPDATE sessions SET balance_cents = ?, last_active_at = ? WHERE session_id = ?`
      ),
      globalStats: db.prepare(
        `SELECT COUNT(*) as total_bets,
                COALESCE(SUM(bet_cents), 0) as total_wagered,
                COALESCE(SUM(win_cents), 0) as total_won
         FROM history`
      ),
      statsByPaytable: db.prepare(
        `SELECT rows || '_' || risk_level as config_key,
                COUNT(*) as sample_size,
                CASE WHEN SUM(bet_cents) > 0
                     THEN CAST(SUM(win_cents) AS REAL) / SUM(bet_cents)
                     ELSE 0 END as rtp
         FROM history
         GROUP BY rows, risk_level`
      ),
    };
  }

  // ---- Config CRUD ----

  getConfigValue(key: string): unknown | undefined {
    const row = this.stmts.getConfigValue.get(key) as { value: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.value);
  }

  setConfigValue(key: string, value: unknown): void {
    this.stmts.setConfigValue.run(key, JSON.stringify(value), Date.now());
  }

  deleteConfigValue(key: string): void {
    this.stmts.deleteConfigValue.run(key);
  }

  getAllConfigOverrides(): Record<string, unknown> {
    const rows = this.stmts.getAllConfig.all() as Array<{ key: string; value: string }>;
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value); }
      catch { logger.warn({ key: row.key }, 'Invalid JSON in admin_config, skipping'); }
    }
    return result;
  }

  // ---- Audit Log ----

  appendAuditLog(action: string, detail: object, ipHash: string | null): void {
    this.stmts.insertAuditLog.run(action, JSON.stringify(detail), ipHash, Date.now());
  }

  // ---- Session Management ----

  listSessions(page: number, pageSize: number): { sessions: AdminSessionEntry[]; total: number } {
    const offset = (page - 1) * pageSize;
    const rows = this.stmts.listSessions.all(pageSize, offset) as Array<Record<string, unknown>>;
    const totalRow = this.stmts.countSessions.get() as { count: number };
    return {
      sessions: rows.map(r => ({
        sessionId: r.session_id as string,
        balanceCents: r.balance_cents as number,
        createdAt: r.created_at as number,
        lastActiveAt: r.last_active_at as number,
        createdByIpHash: (r.created_by_ip_hash as string) ?? null,
        roundCount: r.round_count as number,
      })),
      total: totalRow.count,
    };
  }

  getSessionDetail(sessionId: string): AdminSessionDetailResponse | null {
    const row = this.stmts.getSessionWithRoundCount.get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const historyRows = this.stmts.getSessionHistory.all(sessionId, 50) as Array<Record<string, unknown>>;
    return {
      session: {
        sessionId: row.session_id as string,
        balanceCents: row.balance_cents as number,
        createdAt: row.created_at as number,
        lastActiveAt: row.last_active_at as number,
        createdByIpHash: (row.created_by_ip_hash as string) ?? null,
        roundCount: row.round_count as number,
      },
      recentHistory: historyRows.map(h => ({
        roundId: h.round_id as string,
        betCents: h.bet_cents as number,
        rows: h.rows as number,
        riskLevel: h.risk_level as string,
        multiplier: h.multiplier as number,
        winCents: h.win_cents as number,
        balanceCents: h.balance_cents as number,
        timestamp: h.timestamp as number,
      })),
    };
  }

  resetSessionBalance(sessionId: string, newBalanceCents: number): boolean {
    const result = this.stmts.resetSessionBalance.run(newBalanceCents, Date.now(), sessionId);
    return result.changes > 0;
  }

  deleteSession(sessionId: string): boolean {
    const result = this.stmts.deleteSession.run(sessionId);
    return result.changes > 0;
  }

  // ---- Analytics ----

  getGlobalStats(maintenanceMode: boolean): AdminStatsResponse {
    const stats = this.stmts.globalStats.get() as {
      total_bets: number; total_wagered: number; total_won: number;
    };
    const totalRow = this.stmts.countSessions.get() as { count: number };
    const activeRow = this.stmts.countActiveSessions.get(
      Date.now() - 60 * 60 * 1000
    ) as { count: number };

    return {
      activeSessions: activeRow.count,
      totalSessions: totalRow.count,
      totalBetsAllTime: stats.total_bets,
      totalWageredCents: stats.total_wagered,
      totalWonCents: stats.total_won,
      houseEdgeCents: stats.total_wagered - stats.total_won,
      observedRtp: stats.total_wagered > 0 ? stats.total_won / stats.total_wagered : 0,
      uptimeSeconds: Math.floor(process.uptime()),
      maintenanceMode,
    };
  }

  getRtpByPaytable(): Record<string, { rtp: number; sampleSize: number }> {
    const rows = this.stmts.statsByPaytable.all() as Array<{
      config_key: string; sample_size: number; rtp: number;
    }>;
    const result: Record<string, { rtp: number; sampleSize: number }> = {};
    for (const row of rows) {
      result[row.config_key] = { rtp: row.rtp, sampleSize: row.sample_size };
    }
    return result;
  }

  /** Wrap operations in a SQLite transaction. */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
