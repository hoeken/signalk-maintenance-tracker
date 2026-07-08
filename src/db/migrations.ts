import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  version: number;
  up: (db: DatabaseSync) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT,
          runtime_interval REAL,
          time_interval INTEGER,
          time_interval_unit TEXT CHECK (time_interval_unit IN ('days','weeks','months','years')),
          runtime_path TEXT,
          last_maintenance TEXT,
          last_runtime REAL,
          seed_last_maintenance TEXT,
          seed_last_runtime REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE
        );

        CREATE TABLE task_tags (
          task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY (task_id, tag_id)
        );

        CREATE TABLE log_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          maintenance_date TEXT NOT NULL,
          runtime_hours REAL,
          notes TEXT,
          logged_by TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_log_task_date ON log_entries (task_id, maintenance_date DESC);

        CREATE TABLE runtime_cache (
          path TEXT PRIMARY KEY,
          value REAL NOT NULL,
          timestamp TEXT NOT NULL
        );
      `);
    },
  },
];
