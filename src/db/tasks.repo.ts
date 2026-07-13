import type { DatabaseSync } from 'node:sqlite';
import { TaskRow, TimeUnit } from '../types';

export interface NewTask {
  slug: string;
  name: string;
  description: string | null;
  runtime_interval: number | null;
  time_interval: number | null;
  time_interval_unit: TimeUnit | null;
  runtime_path: string | null;
  due_date: string | null;
  runtime_warning_hours: number | null;
  time_warning_days: number | null;
  last_maintenance: string | null;
  last_runtime: number | null;
  seed_last_maintenance: string | null;
  seed_last_runtime: number | null;
}

const COLUMNS = `id, slug, name, description, runtime_interval, time_interval,
  time_interval_unit, runtime_path, due_date, runtime_warning_hours,
  time_warning_days, last_maintenance, last_runtime,
  seed_last_maintenance, seed_last_runtime, created_at, updated_at`;

export class TasksRepo {
  constructor(private db: DatabaseSync) {}

  create(t: NewTask, nowIso: string): TaskRow {
    const result = this.db
      .prepare(
        `INSERT INTO tasks (slug, name, description, runtime_interval, time_interval,
           time_interval_unit, runtime_path, due_date, runtime_warning_hours,
           time_warning_days, last_maintenance, last_runtime,
           seed_last_maintenance, seed_last_runtime, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        t.slug,
        t.name,
        t.description,
        t.runtime_interval,
        t.time_interval,
        t.time_interval_unit,
        t.runtime_path,
        t.due_date,
        t.runtime_warning_hours,
        t.time_warning_days,
        t.last_maintenance,
        t.last_runtime,
        t.seed_last_maintenance,
        t.seed_last_runtime,
        nowIso,
        nowIso,
      );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): TaskRow | undefined {
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM tasks WHERE id = ?`)
      .get(id) as TaskRow | undefined;
  }

  getBySlug(slug: string): TaskRow | undefined {
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM tasks WHERE slug = ?`)
      .get(slug) as TaskRow | undefined;
  }

  listAll(): TaskRow[] {
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM tasks ORDER BY name COLLATE NOCASE`)
      .all() as unknown as TaskRow[];
  }

  slugExists(slug: string, excludeId?: number): boolean {
    const row =
      excludeId != null
        ? this.db
            .prepare(`SELECT 1 AS x FROM tasks WHERE slug = ? AND id != ?`)
            .get(slug, excludeId)
        : this.db.prepare(`SELECT 1 AS x FROM tasks WHERE slug = ?`).get(slug);
    return row !== undefined;
  }

  /**
   * Full-row update of the mutable columns (service layer merges partial input
   * into the loaded row before calling this).
   */
  update(id: number, t: NewTask, nowIso: string): void {
    this.db
      .prepare(
        `UPDATE tasks SET slug = ?, name = ?, description = ?, runtime_interval = ?,
           time_interval = ?, time_interval_unit = ?, runtime_path = ?,
           due_date = ?, runtime_warning_hours = ?, time_warning_days = ?,
           last_maintenance = ?, last_runtime = ?,
           seed_last_maintenance = ?, seed_last_runtime = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        t.slug,
        t.name,
        t.description,
        t.runtime_interval,
        t.time_interval,
        t.time_interval_unit,
        t.runtime_path,
        t.due_date,
        t.runtime_warning_hours,
        t.time_warning_days,
        t.last_maintenance,
        t.last_runtime,
        t.seed_last_maintenance,
        t.seed_last_runtime,
        nowIso,
        id,
      );
  }

  setLast(
    id: number,
    lastMaintenance: string | null,
    lastRuntime: number | null,
  ): void {
    this.db
      .prepare(
        `UPDATE tasks SET last_maintenance = ?, last_runtime = ? WHERE id = ?`,
      )
      .run(lastMaintenance, lastRuntime, id);
  }

  /** Clear a task's one-time due date (a completed deadline no longer applies). */
  clearDueDate(id: number): void {
    this.db.prepare(`UPDATE tasks SET due_date = NULL WHERE id = ?`).run(id);
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  }

  count(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM tasks`).get() as {
      n: number;
    };
    return row.n;
  }

  /** Distinct non-null runtime paths across all tasks (drives subscriptions). */
  runtimePaths(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT runtime_path AS p FROM tasks WHERE runtime_path IS NOT NULL AND runtime_path != ''`,
      )
      .all() as unknown as { p: string }[];
    return rows.map((r) => r.p);
  }
}
