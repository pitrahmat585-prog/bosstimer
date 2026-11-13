import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type AppDatabase = Database.Database;

export function createDatabase(dbPath: string): AppDatabase {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
}

function runMigrations(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_configs (
      guild_id TEXT PRIMARY KEY,
      timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
      alert_channel_id TEXT,
      board_channel_id TEXT,
      board_message_id TEXT,
      default_mention_target TEXT,
      default_lead_minutes TEXT NOT NULL DEFAULT '[15,5,1]',
      spawn_grace_minutes INTEGER NOT NULL DEFAULT 5,
      manager_role_id TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bosses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_lower TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('cooldown', 'schedule')),
      category TEXT NOT NULL DEFAULT 'World Boss',
      location TEXT,
      respawn_minutes INTEGER,
      respawn_max_minutes INTEGER,
      schedule_days TEXT,
      schedule_times TEXT,
      schedule_interval_days INTEGER,
      schedule_anchor_date TEXT,
      lead_minutes TEXT,
      mention_target TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_killed_at INTEGER,
      last_killed_by TEXT,
      manual_next_at INTEGER,
      manual_next_end_at INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(guild_id, name_lower)
    );

    CREATE INDEX IF NOT EXISTS idx_bosses_guild_enabled
      ON bosses (guild_id, enabled);

    CREATE TABLE IF NOT EXISTS sent_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      boss_id INTEGER NOT NULL REFERENCES bosses(id) ON DELETE CASCADE,
      occurrence_key TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      UNIQUE(boss_id, occurrence_key, alert_type)
    );

    CREATE TABLE IF NOT EXISTS kill_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      boss_id INTEGER NOT NULL REFERENCES bosses(id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      killed_at INTEGER NOT NULL,
      reported_by TEXT NOT NULL,
      source TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kill_logs_boss_time
      ON kill_logs (boss_id, killed_at DESC);
  `);

  const bossCols = db
    .prepare('PRAGMA table_info(bosses)')
    .all() as Array<{ name: string }>;
  const colNames = new Set(bossCols.map((c) => c.name));
  if (!colNames.has('schedule_interval_days')) {
    db.exec('ALTER TABLE bosses ADD COLUMN schedule_interval_days INTEGER');
  }
  if (!colNames.has('schedule_anchor_date')) {
    db.exec('ALTER TABLE bosses ADD COLUMN schedule_anchor_date TEXT');
  }
}
