import { describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { TasksRepo } from './tasks.repo';
import { ConsumablesRepo } from './consumables.repo';

const NOW = '2026-07-11T12:00:00.000Z';

function setup() {
  const db = openDatabase(':memory:');
  const tasks = new TasksRepo(db);
  const consumables = new ConsumablesRepo(db);
  const task = tasks.create(
    {
      slug: 'oil-change',
      name: 'Oil change',
      description: null,
      runtime_interval: 250,
      time_interval: null,
      time_interval_unit: null,
      runtime_path: 'propulsion.main.runTime',
      due_date: null,
      last_maintenance: null,
      last_runtime: null,
      seed_last_maintenance: null,
      seed_last_runtime: null,
    },
    NOW,
  );
  return { db, tasks, consumables, task };
}

describe('ConsumablesRepo', () => {
  it('starts empty for a task with none linked', () => {
    const { consumables, task } = setup();
    expect(consumables.forTask(task.id)).toEqual([]);
  });

  it('links consumables to a task and reads them back', () => {
    const { consumables, task } = setup();
    consumables.setForTask(
      task.id,
      [
        {
          item_id: 'item-oil-filter',
          item_name: 'Oil filter',
          qty_per_service: 1,
        },
        {
          item_id: 'item-engine-oil',
          item_name: 'Engine oil (L)',
          qty_per_service: 5,
        },
      ],
      NOW,
    );
    const rows = consumables.forTask(task.id);
    expect(rows.map((r) => r.item_name)).toEqual([
      'Engine oil (L)',
      'Oil filter',
    ]);
    expect(
      rows.find((r) => r.item_id === 'item-engine-oil')?.qty_per_service,
    ).toBe(5);
  });

  it('setForTask replaces the previous set wholesale', () => {
    const { consumables, task } = setup();
    consumables.setForTask(
      task.id,
      [
        {
          item_id: 'item-oil-filter',
          item_name: 'Oil filter',
          qty_per_service: 1,
        },
      ],
      NOW,
    );
    consumables.setForTask(
      task.id,
      [
        {
          item_id: 'item-engine-oil',
          item_name: 'Engine oil (L)',
          qty_per_service: 5,
        },
      ],
      NOW,
    );
    const rows = consumables.forTask(task.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].item_id).toBe('item-engine-oil');
  });

  it('setForTask de-duplicates repeated item_ids in the input', () => {
    const { consumables, task } = setup();
    consumables.setForTask(
      task.id,
      [
        {
          item_id: 'item-oil-filter',
          item_name: 'Oil filter',
          qty_per_service: 1,
        },
        {
          item_id: 'item-oil-filter',
          item_name: 'Oil filter (dup)',
          qty_per_service: 2,
        },
      ],
      NOW,
    );
    const rows = consumables.forTask(task.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty_per_service).toBe(1);
  });

  it('byTask groups consumables across all tasks in one query', () => {
    const { tasks, consumables, task } = setup();
    const task2 = tasks.create(
      {
        slug: 'impeller',
        name: 'Impeller replacement',
        description: null,
        runtime_interval: null,
        time_interval: 1,
        time_interval_unit: 'years',
        runtime_path: null,
        due_date: null,
        last_maintenance: null,
        last_runtime: null,
        seed_last_maintenance: null,
        seed_last_runtime: null,
      },
      NOW,
    );
    consumables.setForTask(
      task.id,
      [
        {
          item_id: 'item-oil-filter',
          item_name: 'Oil filter',
          qty_per_service: 1,
        },
      ],
      NOW,
    );
    consumables.setForTask(
      task2.id,
      [{ item_id: 'item-impeller', item_name: 'Impeller', qty_per_service: 1 }],
      NOW,
    );
    const map = consumables.byTask();
    expect(map.get(task.id)?.map((r) => r.item_name)).toEqual(['Oil filter']);
    expect(map.get(task2.id)?.map((r) => r.item_name)).toEqual(['Impeller']);
  });

  it('updateCachedName refreshes item_name wherever that item_id is linked', () => {
    const { tasks, consumables, task } = setup();
    const task2 = tasks.create(
      {
        slug: 'generic-service',
        name: 'Generic service',
        description: null,
        runtime_interval: null,
        time_interval: null,
        time_interval_unit: null,
        runtime_path: null,
        due_date: null,
        last_maintenance: null,
        last_runtime: null,
        seed_last_maintenance: null,
        seed_last_runtime: null,
      },
      NOW,
    );
    consumables.setForTask(
      task.id,
      [
        {
          item_id: 'item-oil-filter',
          item_name: 'Oil filter',
          qty_per_service: 1,
        },
      ],
      NOW,
    );
    consumables.setForTask(
      task2.id,
      [
        {
          item_id: 'item-oil-filter',
          item_name: 'Oil filter',
          qty_per_service: 1,
        },
      ],
      NOW,
    );
    consumables.updateCachedName(
      'item-oil-filter',
      'Oil filter (renamed in stowage-mgmt)',
    );
    expect(consumables.forTask(task.id)[0].item_name).toBe(
      'Oil filter (renamed in stowage-mgmt)',
    );
    expect(consumables.forTask(task2.id)[0].item_name).toBe(
      'Oil filter (renamed in stowage-mgmt)',
    );
  });

  it('removeForTask clears all links for a task', () => {
    const { consumables, task } = setup();
    consumables.setForTask(
      task.id,
      [
        {
          item_id: 'item-oil-filter',
          item_name: 'Oil filter',
          qty_per_service: 1,
        },
      ],
      NOW,
    );
    consumables.removeForTask(task.id);
    expect(consumables.forTask(task.id)).toEqual([]);
  });

  it('cascades on task deletion (ON DELETE CASCADE)', () => {
    const { db, consumables, task } = setup();
    consumables.setForTask(
      task.id,
      [
        {
          item_id: 'item-oil-filter',
          item_name: 'Oil filter',
          qty_per_service: 1,
        },
      ],
      NOW,
    );
    db.prepare(`DELETE FROM tasks WHERE id = ?`).run(task.id);
    expect(consumables.forTask(task.id)).toEqual([]);
  });
});
