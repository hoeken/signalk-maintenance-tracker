import type { DatabaseSync } from 'node:sqlite';
import { LogRow } from '../types';

export interface NewLog {
  /** null for a standalone (non-task) entry, which must carry a title. */
  task_id: number | null;
  title: string | null;
  maintenance_date: string;
  runtime_hours: number | null;
  notes: string | null;
  logged_by: string | null;
  actual_hours: number | null;
  actual_cost: number | null;
}

/** Raw SUM/COUNT of the recorded actuals over a set of entries — COUNT
 * skips NULLs, so each count is how many entries recorded that figure. */
export interface WorkSums {
  hours_total: number;
  hours_count: number;
  cost_total: number;
  cost_count: number;
}

/** WorkSums for one task, plus how many entries it has in all. */
export type TaskWorkSums = WorkSums & { log_count: number };

const SUMS_SQL = `COALESCE(SUM(l.actual_hours), 0) AS hours_total,
  COUNT(l.actual_hours) AS hours_count,
  COALESCE(SUM(l.actual_cost), 0) AS cost_total,
  COUNT(l.actual_cost) AS cost_count`;

/** A master-log row: the entry plus its task's slug and name (both null on
 * a standalone entry). */
export type MasterLogRow = LogRow & {
  task_slug: string | null;
  task_name: string | null;
};

export interface MasterLogQuery {
  search?: string;
  sort?: 'maintenance_date' | 'task' | 'runtime_hours';
  order?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const LOG_COLUMNS = `l.id, l.task_id, l.title, l.maintenance_date, l.runtime_hours, l.notes,
  l.logged_by, l.actual_hours, l.actual_cost, l.created_at, l.updated_at`;

export class LogsRepo {
  constructor(private db: DatabaseSync) {}

  insert(entry: NewLog, nowIso: string): LogRow {
    const result = this.db
      .prepare(
        `INSERT INTO log_entries (task_id, title, maintenance_date, runtime_hours, notes, logged_by,
           actual_hours, actual_cost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.task_id,
        entry.title,
        entry.maintenance_date,
        entry.runtime_hours,
        entry.notes,
        entry.logged_by,
        entry.actual_hours,
        entry.actual_cost,
        nowIso,
      );
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): LogRow | undefined {
    return this.db
      .prepare(`SELECT ${LOG_COLUMNS} FROM log_entries l WHERE l.id = ?`)
      .get(id) as LogRow | undefined;
  }

  update(
    id: number,
    fields: {
      title: string | null;
      maintenance_date: string;
      runtime_hours: number | null;
      notes: string | null;
      actual_hours: number | null;
      actual_cost: number | null;
      updated_at: string | null;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE log_entries SET title = ?, maintenance_date = ?, runtime_hours = ?, notes = ?,
           actual_hours = ?, actual_cost = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        fields.title,
        fields.maintenance_date,
        fields.runtime_hours,
        fields.notes,
        fields.actual_hours,
        fields.actual_cost,
        fields.updated_at,
        id,
      );
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM log_entries WHERE id = ?`).run(id);
  }

  latestForTask(taskId: number): LogRow | undefined {
    return this.db
      .prepare(
        `SELECT ${LOG_COLUMNS} FROM log_entries l
         WHERE l.task_id = ? ORDER BY l.maintenance_date DESC, l.id DESC LIMIT 1`,
      )
      .get(taskId) as LogRow | undefined;
  }

  listForTask(taskId: number): LogRow[] {
    return this.db
      .prepare(
        `SELECT ${LOG_COLUMNS} FROM log_entries l
         WHERE l.task_id = ? ORDER BY l.maintenance_date DESC, l.id DESC`,
      )
      .all(taskId) as unknown as LogRow[];
  }

  /** Task ids that have at least one log note matching the LIKE pattern. */
  taskIdsWithNotesLike(pattern: string): Set<number> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT task_id AS id FROM log_entries
         WHERE task_id IS NOT NULL AND notes LIKE ?`,
      )
      .all(pattern) as unknown as { id: number }[];
    return new Set(rows.map((r) => r.id));
  }

  count(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM log_entries`)
      .get() as { n: number };
    return row.n;
  }

  countForTask(taskId: number): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM log_entries WHERE task_id = ?`)
      .get(taskId) as { n: number };
    return row.n;
  }

  /** Recorded actuals summed per task (task-linked entries only). */
  sumsByTask(): Map<number, TaskWorkSums> {
    const rows = this.db
      .prepare(
        `SELECT l.task_id AS task_id, COUNT(*) AS log_count, ${SUMS_SQL}
         FROM log_entries l WHERE l.task_id IS NOT NULL GROUP BY l.task_id`,
      )
      .all() as unknown as (TaskWorkSums & { task_id: number })[];
    return new Map(rows.map(({ task_id, ...sums }) => [task_id, sums]));
  }

  /** Recorded actuals summed over every entry, or only standalone ones,
   * plus how many entries that is. */
  sums(opts: { standaloneOnly?: boolean } = {}): TaskWorkSums {
    const where = opts.standaloneOnly ? 'WHERE l.task_id IS NULL' : '';
    return this.db
      .prepare(
        `SELECT COUNT(*) AS log_count, ${SUMS_SQL} FROM log_entries l ${where}`,
      )
      .get() as unknown as TaskWorkSums;
  }

  /** Recorded actuals summed over every master-log entry matching `search`
   * (all pages). */
  masterSums(search?: string): WorkSums {
    const { whereSql, params } = this.masterWhere(search);
    return this.db
      .prepare(
        `SELECT ${SUMS_SQL} FROM log_entries l LEFT JOIN tasks t ON t.id = l.task_id ${whereSql}`,
      )
      .get(...params) as unknown as WorkSums;
  }

  /** The master log's search filter. LEFT JOIN: standalone entries have no
   * task row — they list under their own title, which stands in for the
   * task name in search and sort too. */
  private masterWhere(search?: string): {
    whereSql: string;
    params: string[];
  } {
    if (!search) return { whereSql: '', params: [] };
    const like = `%${search}%`;
    return {
      whereSql: `WHERE (l.notes LIKE ? OR t.name LIKE ? OR l.title LIKE ? OR l.logged_by LIKE ?)`,
      params: [like, like, like, like],
    };
  }

  listMaster(q: MasterLogQuery): { data: MasterLogRow[]; total: number } {
    const { whereSql, params } = this.masterWhere(q.search);

    const sortCol =
      q.sort === 'task'
        ? 'COALESCE(t.name, l.title) COLLATE NOCASE'
        : q.sort === 'runtime_hours'
          ? 'l.runtime_hours'
          : 'l.maintenance_date';
    const orderSql = q.order === 'asc' ? 'ASC' : 'DESC';

    const totalRow = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM log_entries l LEFT JOIN tasks t ON t.id = l.task_id ${whereSql}`,
      )
      .get(...params) as { n: number };

    const data = this.db
      .prepare(
        `SELECT ${LOG_COLUMNS}, t.slug AS task_slug, t.name AS task_name
         FROM log_entries l LEFT JOIN tasks t ON t.id = l.task_id
         ${whereSql}
         ORDER BY ${sortCol} ${orderSql}, l.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(
        ...params,
        q.pageSize,
        (q.page - 1) * q.pageSize,
      ) as unknown as MasterLogRow[];

    return { data, total: totalRow.n };
  }
}
