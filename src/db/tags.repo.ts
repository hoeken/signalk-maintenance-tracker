import type { DatabaseSync } from 'node:sqlite';

export interface TagCount {
  id: number;
  name: string;
  count: number;
}

export class TagsRepo {
  constructor(private db: DatabaseSync) {}

  /** Find (case-insensitively) or create a tag; returns its id. */
  getOrCreate(name: string): number {
    const trimmed = name.trim();
    const existing = this.db
      .prepare(`SELECT id FROM tags WHERE name = ?`)
      .get(trimmed) as { id: number } | undefined;
    if (existing) return existing.id;
    const result = this.db
      .prepare(`INSERT INTO tags (name) VALUES (?)`)
      .run(trimmed);
    return Number(result.lastInsertRowid);
  }

  /** Dedupe names case-insensitively (dropping blanks) and resolve to tag ids,
   * creating tags on demand. */
  private resolveIds(names: string[]): number[] {
    const seen = new Set<string>();
    const ids: number[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ids.push(this.getOrCreate(name));
    }
    return ids;
  }

  /** Replace a task's tag set; creates new tags on demand and prunes orphans. */
  setTaskTags(taskId: number, names: string[]): void {
    const ids = this.resolveIds(names);
    this.db.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(taskId);
    const insert = this.db.prepare(
      `INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)`,
    );
    for (const tagId of ids) insert.run(taskId, tagId);
    this.pruneOrphans();
  }

  /** Replace a log entry's tag set; same semantics as setTaskTags. */
  setLogTags(logId: number, names: string[]): void {
    const ids = this.resolveIds(names);
    this.db.prepare(`DELETE FROM log_tags WHERE log_id = ?`).run(logId);
    const insert = this.db.prepare(
      `INSERT INTO log_tags (log_id, tag_id) VALUES (?, ?)`,
    );
    for (const tagId of ids) insert.run(logId, tagId);
    this.pruneOrphans();
  }

  tagsForTask(taskId: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT t.name AS name FROM tags t
         JOIN task_tags tt ON tt.tag_id = t.id
         WHERE tt.task_id = ? ORDER BY t.name COLLATE NOCASE`,
      )
      .all(taskId) as unknown as { name: string }[];
    return rows.map((r) => r.name);
  }

  tagsForLog(logId: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT t.name AS name FROM tags t
         JOIN log_tags lt ON lt.tag_id = t.id
         WHERE lt.log_id = ? ORDER BY t.name COLLATE NOCASE`,
      )
      .all(logId) as unknown as { name: string }[];
    return rows.map((r) => r.name);
  }

  /** One query for the whole task list: task_id -> tag names. */
  tagsByTask(): Map<number, string[]> {
    return this.groupNames(
      `SELECT tt.task_id AS owner_id, t.name AS name FROM tags t
       JOIN task_tags tt ON tt.tag_id = t.id
       ORDER BY t.name COLLATE NOCASE`,
    );
  }

  /** One query for a whole log listing: log_id -> tag names. */
  tagsByLog(): Map<number, string[]> {
    return this.groupNames(
      `SELECT lt.log_id AS owner_id, t.name AS name FROM tags t
       JOIN log_tags lt ON lt.tag_id = t.id
       ORDER BY t.name COLLATE NOCASE`,
    );
  }

  private groupNames(sql: string): Map<number, string[]> {
    const rows = this.db.prepare(sql).all() as unknown as {
      owner_id: number;
      name: string;
    }[];
    const map = new Map<number, string[]>();
    for (const r of rows) {
      const list = map.get(r.owner_id) ?? [];
      list.push(r.name);
      map.set(r.owner_id, list);
    }
    return map;
  }

  listWithCounts(): TagCount[] {
    return this.db
      .prepare(
        `SELECT t.id AS id, t.name AS name,
           (SELECT COUNT(*) FROM task_tags WHERE tag_id = t.id)
             + (SELECT COUNT(*) FROM log_tags WHERE tag_id = t.id) AS count
         FROM tags t ORDER BY t.name COLLATE NOCASE`,
      )
      .all() as unknown as TagCount[];
  }

  /** Remove tags no task and no log references (§5.2). */
  pruneOrphans(): void {
    this.db.exec(
      `DELETE FROM tags WHERE id NOT IN (
         SELECT tag_id FROM task_tags UNION SELECT tag_id FROM log_tags
       )`,
    );
  }
}
