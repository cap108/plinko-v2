import type Database from 'better-sqlite3';
import { logger } from './logger.js';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;       // 1 hour
export const MAX_SESSIONS = 10_000;
export const MAX_HISTORY_PER_SESSION = 500;

export interface SessionRecord {
  sessionId: string;
  balanceCents: number;
  createdAt: number;
  lastActiveAt: number;
  createdByIpHash: string | null;
}

export interface HistoryRecord {
  sessionId: string;
  roundId: string;
  betCents: number;
  rows: number;
  riskLevel: string;
  slotIndex: number;
  multiplier: number;
  winCents: number;
  balanceCents: number;
  timestamp: number;
  serverSeedHash: string | null;
  nonce: number | null;
}

export class Store {
  private db: Database.Database;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private stmts: {
    getSession: Database.Statement;
    createSession: Database.Statement;
    updateBalance: Database.Statement;
    sessionCount: Database.Statement;
    deleteExpiredSessions: Database.Statement;
    appendHistory: Database.Statement;
    getHistory: Database.Statement;
    trimHistory: Database.Statement;
    countSessionsByIp: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.db = db;
    this.stmts = {
      getSession: db.prepare(
        `SELECT session_id, balance_cents, created_at, last_active_at, created_by_ip_hash
         FROM sessions WHERE session_id = ?`
      ),
      createSession: db.prepare(
        `INSERT INTO sessions (session_id, balance_cents, created_at, last_active_at, created_by_ip_hash)
         VALUES (?, ?, ?, ?, ?)`
      ),
      updateBalance: db.prepare(
        `UPDATE sessions SET balance_cents = ?, last_active_at = ? WHERE session_id = ?`
      ),
      sessionCount: db.prepare(
        `SELECT COUNT(*) as count FROM sessions`
      ),
      deleteExpiredSessions: db.prepare(
        `DELETE FROM sessions WHERE last_active_at < ?`
      ),
      appendHistory: db.prepare(
        `INSERT INTO history (session_id, round_id, bet_cents, rows, risk_level, slot_index,
         multiplier, win_cents, balance_cents, timestamp, server_seed_hash, nonce)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ),
      getHistory: db.prepare(
        `SELECT round_id, bet_cents, rows, risk_level, slot_index, multiplier,
         win_cents, balance_cents, timestamp
         FROM history WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?`
      ),
      trimHistory: db.prepare(
        `DELETE FROM history WHERE session_id = ? AND id NOT IN (
           SELECT id FROM history WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?
         )`
      ),
      countSessionsByIp: db.prepare(
        `SELECT COUNT(*) as count FROM sessions
         WHERE created_by_ip_hash = ? AND created_at > ?`
      ),
    };
  }

  getSession(sessionId: string): SessionRecord | undefined {
    const row = this.stmts.getSession.get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      sessionId: row.session_id as string,
      balanceCents: row.balance_cents as number,
      createdAt: row.created_at as number,
      lastActiveAt: row.last_active_at as number,
      createdByIpHash: (row.created_by_ip_hash as string) ?? null,
    };
  }

  createSession(sessionId: string, initialBalanceCents: number, ipHash: string | null): SessionRecord {
    const now = Date.now();
    this.stmts.createSession.run(sessionId, initialBalanceCents, now, now, ipHash);
    return {
      sessionId,
      balanceCents: initialBalanceCents,
      createdAt: now,
      lastActiveAt: now,
      createdByIpHash: ipHash,
    };
  }

  updateBalance(sessionId: string, newBalanceCents: number): void {
    if (newBalanceCents > 1_000_000_000) throw new Error('Balance overflow');
    this.stmts.updateBalance.run(newBalanceCents, Date.now(), sessionId);
  }

  sessionCount(): number {
    const row = this.stmts.sessionCount.get() as { count: number };
    return row.count;
  }

  countSessionsByIp(ipHash: string, sinceTimestamp: number): number {
    const row = this.stmts.countSessionsByIp.get(ipHash, sinceTimestamp) as { count: number };
    return row.count;
  }

  appendHistory(record: HistoryRecord): void {
    this.stmts.appendHistory.run(
      record.sessionId, record.roundId, record.betCents, record.rows,
      record.riskLevel, record.slotIndex, record.multiplier, record.winCents,
      record.balanceCents, record.timestamp, record.serverSeedHash, record.nonce,
    );
    // Trim to cap
    this.stmts.trimHistory.run(record.sessionId, record.sessionId, MAX_HISTORY_PER_SESSION);
  }

  getHistory(sessionId: string, limit: number): HistoryRecord[] {
    const rows = this.stmts.getHistory.all(sessionId, limit) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      sessionId,
      roundId: row.round_id as string,
      betCents: row.bet_cents as number,
      rows: row.rows as number,
      riskLevel: row.risk_level as string,
      slotIndex: row.slot_index as number,
      multiplier: row.multiplier as number,
      winCents: row.win_cents as number,
      balanceCents: row.balance_cents as number,
      timestamp: row.timestamp as number,
      serverSeedHash: null,
      nonce: null,
    }));
  }

  cleanupExpiredSessions(): number {
    const cutoff = Date.now() - SESSION_TTL_MS;
    this.stmts.deleteExpiredSessions.run(cutoff);
    const changes = this.db.prepare('SELECT changes() as c').get() as { c: number };
    if (changes.c > 0) {
      logger.info({ removed: changes.c }, 'Expired sessions cleaned up');
    }
    return changes.c;
  }

  startCleanupInterval(): void {
    this.cleanupExpiredSessions();
    this.cleanupTimer = setInterval(() => this.cleanupExpiredSessions(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  stopCleanupInterval(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
