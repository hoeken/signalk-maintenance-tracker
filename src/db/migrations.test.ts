import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate, schemaVersion } from './database';
import { migrations } from './migrations';

/** Run migrations up to (and including) `version` on a fresh in-memory db. */
function openAt(version: number): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(
    `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  );
  for (const m of migrations) {
    if (m.version > version) break;
    m.up(db);
    db.prepare(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(String(m.version));
  }
  return db;
}

describe('migration 7 — is_recurring backfill (v1.5)', () => {
  it('keeps interval tasks recurring and demotes schedule-less tasks to todos', () => {
    const db = openAt(6);
    const insert = db.prepare(
      `INSERT INTO tasks (slug, name, runtime_interval, time_interval,
         time_interval_unit, runtime_path, runtime_warning_hours,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '2026-01-01', '2026-01-01')`,
    );
    insert.run('oil-change', 'Oil change', 200, null, null, 'p.runTime', 5);
    insert.run('zincs', 'Zincs', null, 6, 'months', null, null);
    // schedule-less "tracker" task: runtime path but no interval at all
    insert.run('bilge', 'Bilge check', null, null, null, 'p.runTime', 10);
    insert.run('paperwork', 'Paperwork', null, null, null, null, null);

    migrate(db); // applies migration 7
    expect(schemaVersion(db)).toBe(7);

    const rows = db
      .prepare(
        `SELECT slug, is_recurring, runtime_path, runtime_warning_hours
         FROM tasks ORDER BY slug`,
      )
      .all() as {
      slug: string;
      is_recurring: number;
      runtime_path: string | null;
      runtime_warning_hours: number | null;
    }[];

    expect(rows).toEqual([
      // demoted: no interval → todo, runtime tracking cleared
      {
        slug: 'bilge',
        is_recurring: 0,
        runtime_path: null,
        runtime_warning_hours: null,
      },
      {
        slug: 'oil-change',
        is_recurring: 1,
        runtime_path: 'p.runTime',
        runtime_warning_hours: 5,
      },
      {
        slug: 'paperwork',
        is_recurring: 0,
        runtime_path: null,
        runtime_warning_hours: null,
      },
      {
        slug: 'zincs',
        is_recurring: 1,
        runtime_path: null,
        runtime_warning_hours: null,
      },
    ]);
  });
});
