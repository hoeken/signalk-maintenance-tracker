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

    migrate(db); // applies migrations 7+
    expect(schemaVersion(db)).toBe(8);

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

describe('migration 8 — log_tags link table', () => {
  it('creates log_tags and cascades on log and tag deletion', () => {
    const db = openAt(8);
    db.prepare(
      `INSERT INTO tasks (slug, name, created_at, updated_at)
       VALUES ('t', 'T', '2026-01-01', '2026-01-01')`,
    ).run();
    db.prepare(
      `INSERT INTO log_entries (task_id, maintenance_date, created_at)
       VALUES (1, '2026-01-01', '2026-01-01')`,
    ).run();
    db.prepare(`INSERT INTO tags (name) VALUES ('winter')`).run();
    db.prepare(`INSERT INTO log_tags (log_id, tag_id) VALUES (1, 1)`).run();

    const count = () =>
      (db.prepare(`SELECT COUNT(*) AS n FROM log_tags`).get() as { n: number })
        .n;
    expect(count()).toBe(1);

    // deleting the tag cascades
    db.prepare(`DELETE FROM tags WHERE id = 1`).run();
    expect(count()).toBe(0);

    // re-link, then delete the log entry — also cascades
    db.prepare(`INSERT INTO tags (name) VALUES ('spring')`).run();
    db.prepare(`INSERT INTO log_tags (log_id, tag_id) VALUES (1, 2)`).run();
    expect(count()).toBe(1);
    db.prepare(`DELETE FROM log_entries WHERE id = 1`).run();
    expect(count()).toBe(0);
  });
});
