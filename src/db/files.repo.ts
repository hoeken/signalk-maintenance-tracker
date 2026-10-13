import type { DatabaseSync } from 'node:sqlite';

/** What every attachment index row carries, whatever it is attached to. */
export interface AttachmentRow {
  id: number;
  /** Original filename as uploaded (display + download name). */
  name: string;
  size: number;
  /** Content type as reported by the uploader; null when unknown. */
  mime: string | null;
  /** On-disk location relative to the FileStore root. */
  path: string;
  created_at: string;
}

export interface NewAttachment {
  name: string;
  size: number;
  mime: string | null;
  path: string;
}

/** A task attachment (`task_files`). */
export interface FileRow extends AttachmentRow {
  task_id: number;
}

export interface NewFile extends NewAttachment {
  task_id: number;
}

/** A log-entry attachment (`log_files`). */
export interface LogFileRow extends AttachmentRow {
  log_id: number;
}

export interface NewLogFile extends NewAttachment {
  log_id: number;
}

/**
 * The two attachment tables are the same shape apart from what they hang
 * off (a task or a log entry); this is the shared index access, with the
 * table and owner column fixed per subclass.
 */
abstract class AttachmentsRepo<Row extends AttachmentRow> {
  private readonly columns: string;

  constructor(
    protected db: DatabaseSync,
    private readonly table: string,
    private readonly ownerColumn: string,
  ) {
    this.columns = `id, ${ownerColumn}, name, size, mime, path, created_at`;
  }

  get(id: number): Row | undefined {
    return this.db
      .prepare(`SELECT ${this.columns} FROM ${this.table} WHERE id = ?`)
      .get(id) as Row | undefined;
  }

  protected forOwner(ownerId: number): Row[] {
    return this.db
      .prepare(
        `SELECT ${this.columns} FROM ${this.table}
         WHERE ${this.ownerColumn} = ? ORDER BY name COLLATE NOCASE, id`,
      )
      .all(ownerId) as unknown as Row[];
  }

  /** One query for a whole list: owner id -> files. */
  protected byOwner(): Map<number, Row[]> {
    const rows = this.db
      .prepare(
        `SELECT ${this.columns} FROM ${this.table} ORDER BY name COLLATE NOCASE, id`,
      )
      .all() as unknown as Row[];
    const map = new Map<number, Row[]>();
    for (const r of rows) {
      const owner = (r as unknown as Record<string, number>)[this.ownerColumn];
      const list = map.get(owner) ?? [];
      list.push(r);
      map.set(owner, list);
    }
    return map;
  }

  protected insertFor(ownerId: number, f: NewAttachment, nowIso: string): Row {
    const result = this.db
      .prepare(
        `INSERT INTO ${this.table} (${this.ownerColumn}, name, size, mime, path, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(ownerId, f.name, f.size, f.mime, f.path, nowIso);
    return this.get(Number(result.lastInsertRowid))!;
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }
}

export class FilesRepo extends AttachmentsRepo<FileRow> {
  constructor(db: DatabaseSync) {
    super(db, 'task_files', 'task_id');
  }

  forTask(taskId: number): FileRow[] {
    return this.forOwner(taskId);
  }

  /** One query for the whole task list: task_id -> files. */
  byTask(): Map<number, FileRow[]> {
    return this.byOwner();
  }

  insert(f: NewFile, nowIso: string): FileRow {
    return this.insertFor(f.task_id, f, nowIso);
  }
}

export class LogFilesRepo extends AttachmentsRepo<LogFileRow> {
  constructor(db: DatabaseSync) {
    super(db, 'log_files', 'log_id');
  }

  forLog(logId: number): LogFileRow[] {
    return this.forOwner(logId);
  }

  /** One query for a whole log listing: log_id -> files. */
  byLog(): Map<number, LogFileRow[]> {
    return this.byOwner();
  }

  insert(f: NewLogFile, nowIso: string): LogFileRow {
    return this.insertFor(f.log_id, f, nowIso);
  }
}
