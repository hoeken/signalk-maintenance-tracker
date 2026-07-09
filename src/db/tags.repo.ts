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

  /** Replace a task's tag set; creates new tags on demand and prunes orphans. */
  setTaskTags(taskId: number, names: string[]): void {
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
    this.db.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(taskId);
    const insert = this.db.prepare(
      `INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)`,
    );
    for (const tagId of ids) insert.run(taskId, tagId);
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

  /** One query for the whole task list: task_id -> tag names. */
  tagsByTask(): Map<number, string[]> {
    const rows = this.db
      .prepare(
        `SELECT tt.task_id AS task_id, t.name AS name FROM tags t
         JOIN task_tags tt ON tt.tag_id = t.id
         ORDER BY t.name COLLATE NOCASE`,
      )
      .all() as unknown as { task_id: number; name: string }[];
    const map = new Map<number, string[]>();
    for (const r of rows) {
      const list = map.get(r.task_id) ?? [];
      list.push(r.name);
      map.set(r.task_id, list);
    }
    return map;
  }

  listWithCounts(): TagCount[] {
    return this.db
      .prepare(
        `SELECT t.id AS id, t.name AS name, COUNT(tt.task_id) AS count
         FROM tags t LEFT JOIN task_tags tt ON tt.tag_id = t.id
         GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
      )
      .all() as unknown as TagCount[];
  }

  /** Remove tags no task references (§5.2). */
  pruneOrphans(): void {
    this.db.exec(
      `DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM task_tags)`,
    );
  }
}
