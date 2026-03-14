import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

export function initDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = path.join(DATA_DIR, 'plinko.db');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      balance_cents INTEGER NOT NULL DEFAULT 100000,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      created_by_ip_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      round_id TEXT NOT NULL UNIQUE,
      bet_cents INTEGER NOT NULL,
      rows INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      slot_index INTEGER NOT NULL,
      multiplier REAL NOT NULL,
      win_cents INTEGER NOT NULL,
      balance_cents INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      server_seed_hash TEXT,
      nonce INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_history_session
      ON history(session_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS admin_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      ip_hash TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_timestamp
      ON admin_audit_log(timestamp DESC);
  `);

  logger.info({ dbPath }, 'Database initialized');
  return db;
}
