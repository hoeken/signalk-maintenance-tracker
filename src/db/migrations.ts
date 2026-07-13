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
  {
    version: 2,
    up(db) {
      db.exec(`
        -- Links a task to stowage-mgmt items it consumes on completion.
        -- item_id is a *soft* foreign key into another plugin's database
        -- (signalk-stowage-mgmt) — there is no cross-database FK constraint,
        -- so item_name is cached at link time to keep the UI meaningful even
        -- if stowage-mgmt is unreachable or the item has since been deleted
        -- there (docs/inventory-interaction.md). item_id is TEXT to match
        -- stowage-mgmt's own item ids (it primary-keys items as TEXT, not
        -- an autoincrement integer).
        CREATE TABLE task_consumables (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          qty_per_service REAL NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          UNIQUE (task_id, item_id)
        );
        CREATE INDEX idx_task_consumables_task ON task_consumables (task_id);
      `);
    },
  },
  {
    version: 3,
    up(db) {
      // One-time calendar deadline (registrations, renewals, inspections),
      // independent of the recurring time_interval. Stored as UTC-midnight ISO
      // like maintenance dates; NULL = no deadline.
      db.exec(`ALTER TABLE tasks ADD COLUMN due_date TEXT;`);
    },
  },
  {
    version: 4,
    up(db) {
      // Per-task "due soon" lead windows overriding the plugin-wide defaults
      // (runtimeNotifyLeadHours / timeNotifyLeadDays). NULL = fall back to the
      // plugin default; 0 = no warning window (task jumps ok → overdue).
      // time_warning_days covers both time sub-dimensions (recurring schedule
      // and one-time due date), which share the same date-based status logic.
      db.exec(`ALTER TABLE tasks ADD COLUMN runtime_warning_hours REAL;`);
      db.exec(`ALTER TABLE tasks ADD COLUMN time_warning_days REAL;`);
    },
  },
];
