import type Database from 'better-sqlite3';
import type { AdminSessionEntry, AdminSessionDetailResponse, AdminStatsResponse } from '@plinko-v2/shared';
import { SESSION_TTL_MS } from '../store.js';
import { logger } from '../logger.js';

// Shared SELECT fragment for session list queries
const SESSION_LIST_SELECT = `
  SELECT s.session_id, s.balance_cents, s.created_at, s.last_active_at,
         s.created_by_ip_hash, s.geo_country, s.geo_region, s.guest_id,
         COUNT(h.id) as round_count
  FROM sessions s
  LEFT JOIN history h ON s.session_id = h.session_id`;

const SESSION_LIST_TAIL = `
  GROUP BY s.session_id
  ORDER BY s.last_active_at DESC
  LIMIT ? OFFSET ?`;

export class AdminStore {
  private db: Database.Database;
  private stmts: {
    getConfigValue: Database.Statement;
    setConfigValue: Database.Statement;
    getAllConfig: Database.Statement;
    deleteConfigValue: Database.Statement;
    insertAuditLog: Database.Statement;
    listSessions: Database.Statement;
    listSessionsByGuest: Database.Statement;
    listSessionsByIp: Database.Statement;
    listSessionsByBoth: Database.Statement;
    countSessions: Database.Statement;
    countSessionsByGuest: Database.Statement;
    countSessionsByIp: Database.Statement;
    countSessionsByBoth: Database.Statement;
    countActiveSessions: Database.Statement;
    countActiveSessionsByGuestId: Database.Statement;
    countActiveSessionsByIpHash: Database.Statement;
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
        `${SESSION_LIST_SELECT}${SESSION_LIST_TAIL}`
      ),
      listSessionsByGuest: db.prepare(
        `${SESSION_LIST_SELECT} WHERE s.guest_id = ?${SESSION_LIST_TAIL}`
      ),
      listSessionsByIp: db.prepare(
        `${SESSION_LIST_SELECT} WHERE s.created_by_ip_hash = ?${SESSION_LIST_TAIL}`
      ),
      listSessionsByBoth: db.prepare(
        `${SESSION_LIST_SELECT} WHERE s.guest_id = ? AND s.created_by_ip_hash = ?${SESSION_LIST_TAIL}`
      ),
      countSessions: db.prepare(`SELECT COUNT(*) as count FROM sessions`),
      countSessionsByGuest: db.prepare(
        `SELECT COUNT(*) as count FROM sessions WHERE guest_id = ?`
      ),
      countSessionsByIp: db.prepare(
        `SELECT COUNT(*) as count FROM sessions WHERE created_by_ip_hash = ?`
      ),
      countSessionsByBoth: db.prepare(
        `SELECT COUNT(*) as count FROM sessions WHERE guest_id = ? AND created_by_ip_hash = ?`
      ),
      countActiveSessions: db.prepare(
        `SELECT COUNT(*) as count FROM sessions WHERE last_active_at > ?`
      ),
      countActiveSessionsByGuestId: db.prepare(
        `SELECT COUNT(*) as count FROM sessions WHERE guest_id = ? AND last_active_at > ?`
      ),
      countActiveSessionsByIpHash: db.prepare(
        `SELECT COUNT(*) as count FROM sessions WHERE created_by_ip_hash = ? AND last_active_at > ?`
      ),
      getSessionWithRoundCount: db.prepare(
        `SELECT s.session_id, s.balance_cents, s.created_at, s.last_active_at,
                s.created_by_ip_hash, s.geo_country, s.geo_region, s.guest_id,
                COUNT(h.id) as round_count
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

  private mapSessionRow(r: Record<string, unknown>): AdminSessionEntry {
    return {
      sessionId: r.session_id as string,
      balanceCents: r.balance_cents as number,
      createdAt: r.created_at as number,
      lastActiveAt: r.last_active_at as number,
      createdByIpHash: (r.created_by_ip_hash as string) ?? null,
      roundCount: r.round_count as number,
      geoCountry: (r.geo_country as string) ?? null,
      geoRegion: (r.geo_region as string) ?? null,
      guestId: (r.guest_id as string) ?? null,
    };
  }

  listSessions(page: number, pageSize: number, filters?: { guestId?: string; ipHash?: string }): { sessions: AdminSessionEntry[]; total: number } {
    const offset = (page - 1) * pageSize;
    const hasGuest = !!filters?.guestId;
    const hasIp = !!filters?.ipHash;

    const [listStmt, countStmt] = hasGuest && hasIp
      ? [this.stmts.listSessionsByBoth, this.stmts.countSessionsByBoth]
      : hasGuest
      ? [this.stmts.listSessionsByGuest, this.stmts.countSessionsByGuest]
      : hasIp
      ? [this.stmts.listSessionsByIp, this.stmts.countSessionsByIp]
      : [this.stmts.listSessions, this.stmts.countSessions];

    const filterParams = hasGuest && hasIp
      ? [filters!.guestId!, filters!.ipHash!]
      : hasGuest
      ? [filters!.guestId!]
      : hasIp
      ? [filters!.ipHash!]
      : [];

    const rows = listStmt.all(...filterParams, pageSize, offset) as Array<Record<string, unknown>>;
    const totalRow = countStmt.get(...filterParams) as { count: number };

    return {
      sessions: rows.map(r => this.mapSessionRow(r)),
      total: totalRow.count,
    };
  }

  getSessionDetail(sessionId: string): AdminSessionDetailResponse | null {
    const row = this.stmts.getSessionWithRoundCount.get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const session = this.mapSessionRow(row);
    const historyRows = this.stmts.getSessionHistory.all(sessionId, 50) as Array<Record<string, unknown>>;

    // Count active sessions sharing the same guest_id / ip_hash
    const ttlCutoff = Date.now() - SESSION_TTL_MS;
    let guestSessionCount = 0;
    if (session.guestId) {
      const r = this.stmts.countActiveSessionsByGuestId.get(session.guestId, ttlCutoff) as { count: number };
      guestSessionCount = r.count;
    }
    let ipSessionCount = 0;
    if (session.createdByIpHash) {
      const r = this.stmts.countActiveSessionsByIpHash.get(session.createdByIpHash, ttlCutoff) as { count: number };
      ipSessionCount = r.count;
    }

    return {
      session,
      guestSessionCount,
      ipSessionCount,
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
