import type { DatabaseSync } from 'node:sqlite';

export interface FileRow {
  id: number;
  task_id: number;
  /** Original filename as uploaded (display + download name). */
  name: string;
  size: number;
  /** Content type as reported by the uploader; null when unknown. */
  mime: string | null;
  /** On-disk location relative to the FileStore root. */
  path: string;
  created_at: string;
}

export interface NewFile {
  task_id: number;
  name: string;
  size: number;
  mime: string | null;
  path: string;
}

const FILE_COLUMNS = `id, task_id, name, size, mime, path, created_at`;

export class FilesRepo {
  constructor(private db: DatabaseSync) {}

  get(id: number): FileRow | undefined {
    return this.db
      .prepare(`SELECT ${FILE_COLUMNS} FROM task_files WHERE id = ?`)
      .get(id) as FileRow | undefined;
  }

  forTask(taskId: number): FileRow[] {
    return this.db
      .prepare(
        `SELECT ${FILE_COLUMNS} FROM task_files
         WHERE task_id = ? ORDER BY name COLLATE NOCASE, id`,
      )
      .all(taskId) as unknown as FileRow[];
  }

  /** One query for the whole task list: task_id -> files. */
  byTask(): Map<number, FileRow[]> {
    const rows = this.db
      .prepare(
        `SELECT ${FILE_COLUMNS} FROM task_files ORDER BY name COLLATE NOCASE, id`,
      )
      .all() as unknown as FileRow[];
    const map = new Map<number, FileRow[]>();
    for (const r of rows) {
      const list = map.get(r.task_id) ?? [];
      list.push(r);
      map.set(r.task_id, list);
    }
    return map;
  }

  insert(f: NewFile, nowIso: string): FileRow {
    const result = this.db
      .prepare(
        `INSERT INTO task_files (task_id, name, size, mime, path, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(f.task_id, f.name, f.size, f.mime, f.path, nowIso);
    return this.get(Number(result.lastInsertRowid))!;
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM task_files WHERE id = ?`).run(id);
  }
}
