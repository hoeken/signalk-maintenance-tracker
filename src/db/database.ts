import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations';

export function openDatabase(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  // DatabaseSync enables FK constraints by default; keep it explicit — the
  // cascade rules on task_tags/log_entries depend on it.
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  let version = row ? Number(row.value) : 0;

  for (const m of migrations) {
    if (m.version <= version) continue;
    // node:sqlite has no db.transaction() helper — manage explicitly (§5.8)
    db.exec('BEGIN');
    try {
      m.up(db);
      db.prepare(
        `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(String(m.version));
      db.exec('COMMIT');
      version = m.version;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  return row ? Number(row.value) : 0;
}
