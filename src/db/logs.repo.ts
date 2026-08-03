import type { DatabaseSync } from 'node:sqlite';
import { LogDTO, LogRow } from '../types';

export interface NewLog {
  /** null for a standalone (non-task) entry, which must carry a title. */
  task_id: number | null;
  title: string | null;
  maintenance_date: string;
  runtime_hours: number | null;
  notes: string | null;
  logged_by: string | null;
}

export interface MasterLogQuery {
  search?: string;
  sort?: 'maintenance_date' | 'task' | 'runtime_hours';
  order?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const LOG_COLUMNS = `l.id, l.task_id, l.title, l.maintenance_date, l.runtime_hours, l.notes,
  l.logged_by, l.created_at`;

export class LogsRepo {
  constructor(private db: DatabaseSync) {}

  insert(entry: NewLog, nowIso: string): LogRow {
    const result = this.db
      .prepare(
        `INSERT INTO log_entries (task_id, title, maintenance_date, runtime_hours, notes, logged_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.task_id,
        entry.title,
        entry.maintenance_date,
        entry.runtime_hours,
        entry.notes,
        entry.logged_by,
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
    },
  ): void {
    this.db
      .prepare(
        `UPDATE log_entries SET title = ?, maintenance_date = ?, runtime_hours = ?, notes = ? WHERE id = ?`,
      )
      .run(
        fields.title,
        fields.maintenance_date,
        fields.runtime_hours,
        fields.notes,
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

  listMaster(q: MasterLogQuery): { data: LogDTO[]; total: number } {
    // LEFT JOIN: standalone entries have no task row — they list under their
    // own title, which stands in for the task name in search and sort too.
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.search) {
      const like = `%${q.search}%`;
      where.push(
        `(l.notes LIKE ? OR t.name LIKE ? OR l.title LIKE ? OR l.logged_by LIKE ?)`,
      );
      params.push(like, like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

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
      ) as unknown as LogDTO[];

    return { data, total: totalRow.n };
  }
}
