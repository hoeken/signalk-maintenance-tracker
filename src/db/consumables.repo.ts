import type { DatabaseSync } from 'node:sqlite';

export interface ConsumableRow {
  id: number;
  task_id: number;
  item_id: string;
  item_name: string;
  qty_per_service: number;
  created_at: string;
}

export interface ConsumableInput {
  item_id: string;
  /** Cached at link time — see docs/inventory-interaction.md. */
  item_name: string;
  qty_per_service: number;
}

const CONSUMABLE_COLUMNS = `id, task_id, item_id, item_name, qty_per_service, created_at`;

export class ConsumablesRepo {
  constructor(private db: DatabaseSync) {}

  forTask(taskId: number): ConsumableRow[] {
    return this.db
      .prepare(
        `SELECT ${CONSUMABLE_COLUMNS} FROM task_consumables
         WHERE task_id = ? ORDER BY item_name COLLATE NOCASE`,
      )
      .all(taskId) as unknown as ConsumableRow[];
  }

  /** One query for the whole task list: task_id -> consumables. */
  byTask(): Map<number, ConsumableRow[]> {
    const rows = this.db
      .prepare(
        `SELECT ${CONSUMABLE_COLUMNS} FROM task_consumables
         ORDER BY item_name COLLATE NOCASE`,
      )
      .all() as unknown as ConsumableRow[];
    const map = new Map<number, ConsumableRow[]>();
    for (const r of rows) {
      const list = map.get(r.task_id) ?? [];
      list.push(r);
      map.set(r.task_id, list);
    }
    return map;
  }

  /**
   * Replace a task's linked consumables wholesale (mirrors
   * TagsRepo.setTaskTags). item_name is re-cached from the input on every
   * call, so re-saving a task after an item was renamed in stowage-mgmt
   * refreshes the cached label.
   */
  setForTask(taskId: number, items: ConsumableInput[], nowIso: string): void {
    this.db
      .prepare(`DELETE FROM task_consumables WHERE task_id = ?`)
      .run(taskId);
    const insert = this.db.prepare(
      `INSERT INTO task_consumables (task_id, item_id, item_name, qty_per_service, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.item_id)) continue; // UNIQUE(task_id, item_id) guard
      seen.add(item.item_id);
      insert.run(
        taskId,
        item.item_id,
        item.item_name,
        item.qty_per_service,
        nowIso,
      );
    }
  }

  /** Used to refresh a cached item_name without touching qty_per_service. */
  updateCachedName(itemId: string, itemName: string): void {
    this.db
      .prepare(`UPDATE task_consumables SET item_name = ? WHERE item_id = ?`)
      .run(itemName, itemId);
  }

  removeForTask(taskId: number): void {
    this.db
      .prepare(`DELETE FROM task_consumables WHERE task_id = ?`)
      .run(taskId);
  }
}
