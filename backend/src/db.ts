import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Validate DB_PATH before resolving — a relative path in production would silently use ephemeral storage
if (process.env.DB_PATH && process.env.NODE_ENV === 'production' && !path.isAbsolute(process.env.DB_PATH)) {
  // Can't use logger here (not yet initialized), so use console
  console.error(`FATAL: DB_PATH must be an absolute path in production, got: ${process.env.DB_PATH}`);
  process.exit(1);
}

const DATA_DIR = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '../../data');

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

  // Migrate: add geo and guest_id columns if missing
  const existingCols = new Set(
    (db.pragma('table_info(sessions)') as Array<{ name: string }>).map(c => c.name)
  );
  if (!existingCols.has('geo_country')) db.exec('ALTER TABLE sessions ADD COLUMN geo_country TEXT');
  if (!existingCols.has('geo_region')) db.exec('ALTER TABLE sessions ADD COLUMN geo_region TEXT');
  if (!existingCols.has('guest_id')) db.exec('ALTER TABLE sessions ADD COLUMN guest_id TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_guest_id ON sessions(guest_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_ip_hash ON sessions(created_by_ip_hash);
  `);

  logger.info({ dbPath }, 'Database initialized');
  return db;
}
