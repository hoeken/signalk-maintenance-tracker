import { describe, expect, it, vi } from 'vitest';
import { openDatabase, schemaVersion } from './db/database';
import { ApiError, MaintenanceService } from './service';
import { StowageClient, StowageUnavailableError } from './stowage/client';

const NOW = new Date('2026-07-09T12:00:00Z');

function makeService(
  runtimeValues: Record<string, number> = {},
  stowageClient?: StowageClient,
) {
  const db = openDatabase(':memory:');
  const events: unknown[] = [];
  const service = new MaintenanceService(db, {
    getRuntime: (p) => runtimeValues[p] ?? null,
    config: { runtimeNotifyLeadHours: 10, timeNotifyLeadDays: 7 },
    onMutation: (e) => events.push(e),
    now: () => NOW,
    stowageClient,
  });
  return { db, service, events };
}

describe('migrations', () => {
  it('applies schema and records version', () => {
    const { db } = makeService();
    expect(schemaVersion(db)).toBe(2);
    const tables = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    for (const t of [
      'tasks',
      'tags',
      'task_tags',
      'log_entries',
      'runtime_cache',
      'task_consumables',
      'meta',
    ]) {
      expect(tables).toContain(t);
    }
  });
});

describe('task CRUD', () => {
  it('creates a task with auto-generated slug and returns computed fields', () => {
    const { service } = makeService({ 'propulsion.port.runTime': 1360 });
    const task = service.createTask({
      name: 'Engine oil change',
      description: 'Use **15W-40**.',
      runtime_interval: 200,
      time_interval: 12,
      time_interval_unit: 'months',
      runtime_path: 'propulsion.port.runTime',
      tags: ['Engines', 'Port Engine'],
      last_maintenance: '2026-01-15T10:00:00Z',
      last_runtime: 1240.5,
    });
    expect(task.slug).toBe('engine-oil-change');
    expect(task.tags).toEqual(['Engines', 'Port Engine']);
    expect(task.current_runtime).toBe(1360);
    expect(task.elapsed_runtime).toBeCloseTo(119.5);
    expect(task.remaining_runtime).toBeCloseTo(80.5);
    expect(task.due_date).toBe('2027-01-15T10:00:00.000Z');
    expect(task.status).toBe('ok');
  });

  it('auto-suffixes duplicate auto-generated slugs', () => {
    const { service } = makeService();
    service.createTask({ name: 'Winch service' });
    const second = service.createTask({ name: 'Winch service' });
    expect(second.slug).toBe('winch-service-2');
  });

  it('rejects an explicit slug collision with 409', () => {
    const { service } = makeService();
    service.createTask({ name: 'A', slug: 'shared' });
    expect(() =>
      service.createTask({ name: 'B', slug: 'shared' }),
    ).toThrowError(
      expect.objectContaining({ status: 409, code: 'slug_conflict' }),
    );
  });

  it('requires a name', () => {
    const { service } = makeService();
    expect(() => service.createTask({})).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });

  it('rejects time_interval without unit (and vice versa)', () => {
    const { service } = makeService();
    expect(() => service.createTask({ name: 'X', time_interval: 6 })).toThrow(
      ApiError,
    );
    expect(() =>
      service.createTask({ name: 'X', time_interval_unit: 'months' }),
    ).toThrow(ApiError);
    expect(() =>
      service.createTask({
        name: 'X',
        time_interval: 6,
        time_interval_unit: 'decades' as any,
      }),
    ).toThrow(ApiError);
  });

  it('allows informational-only tasks with no intervals', () => {
    const { service } = makeService();
    const t = service.createTask({ name: 'Registration paperwork' });
    expect(t.status).toBe('unknown');
  });

  it('updates fields without touching the slug on rename', () => {
    const { service } = makeService();
    service.createTask({ name: 'Old name' });
    const updated = service.updateTask('old-name', { name: 'New name' });
    expect(updated.name).toBe('New name');
    expect(updated.slug).toBe('old-name'); // §6.4: rename does not regenerate
  });

  it('changes slug explicitly, normalizing and reporting the old slug', () => {
    const { service, events } = makeService();
    service.createTask({ name: 'Old name' });
    const updated = service.updateTask('old-name', { slug: 'New Slug!' });
    expect(updated.slug).toBe('new-slug');
    expect(events.at(-1)).toEqual({ clearedSlug: 'old-name' });
    expect(service.getTask('new-slug').name).toBe('Old name');
  });

  it('rejects slug change colliding with another task', () => {
    const { service } = makeService();
    service.createTask({ name: 'One' });
    service.createTask({ name: 'Two' });
    expect(() => service.updateTask('two', { slug: 'one' })).toThrowError(
      expect.objectContaining({ status: 409 }),
    );
  });

  it('404s on missing tasks', () => {
    const { service } = makeService();
    expect(() => service.getTask('nope')).toThrowError(
      expect.objectContaining({ status: 404 }),
    );
  });

  it('deletes a task, cascading logs and reporting slug for notification clear', async () => {
    const { service, events } = makeService();
    service.createTask({ name: 'Doomed' });
    await service.addLog(
      'doomed',
      { maintenance_date: '2026-07-01T00:00:00Z' },
      'admin',
    );
    service.deleteTask('doomed');
    expect(events.at(-1)).toEqual({ clearedSlug: 'doomed' });
    expect(service.listMasterLog({}).total).toBe(0);
    expect(() => service.getTask('doomed')).toThrow(ApiError);
  });
});

describe('tags', () => {
  it('creates tags on demand, case-insensitively unique, and prunes orphans', () => {
    const { service } = makeService();
    service.createTask({ name: 'A', tags: ['Engines', 'engines', 'Hull'] });
    let tags = service.listTags();
    expect(tags.map((t) => t.name)).toEqual(['Engines', 'Hull']);

    service.createTask({ name: 'B', tags: ['ENGINES'] });
    tags = service.listTags();
    expect(tags.find((t) => t.name === 'Engines')?.count).toBe(2);

    service.updateTask('a', { tags: [] });
    service.updateTask('b', { tags: [] });
    expect(service.listTags()).toEqual([]); // orphans pruned
  });

  it('prunes tags when their last task is deleted', () => {
    const { service } = makeService();
    service.createTask({ name: 'A', tags: ['Solo'] });
    service.deleteTask('a');
    expect(service.listTags()).toEqual([]);
  });
});

describe('task consumables (docs/inventory-interaction.md)', () => {
  it('createTask links consumables and returns them in the DTO', () => {
    const { service } = makeService();
    const task = service.createTask({
      name: 'Oil change',
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
      ],
    });
    expect(task.consumables).toEqual([
      { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
    ]);
    expect(service.getTask('oil-change').consumables).toEqual(task.consumables);
  });

  it('defaults to no consumables when omitted on create', () => {
    const { service } = makeService();
    const task = service.createTask({ name: 'Bilge check' });
    expect(task.consumables).toEqual([]);
  });

  it('updateTask replaces consumables wholesale, and omitting the field leaves them untouched', () => {
    const { service } = makeService();
    service.createTask({
      name: 'Oil change',
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
      ],
    });

    // omitted -> untouched
    service.updateTask('oil-change', { description: 'note' });
    expect(service.getTask('oil-change').consumables).toHaveLength(1);

    // replaced wholesale
    const updated = service.updateTask('oil-change', {
      consumables: [
        { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 5 },
      ],
    });
    expect(updated.consumables).toEqual([
      { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 5 },
    ]);

    // explicit [] clears them
    const cleared = service.updateTask('oil-change', { consumables: [] });
    expect(cleared.consumables).toEqual([]);
  });

  it('rejects a consumable missing item_id or item_name', () => {
    const { service } = makeService();
    expect(() =>
      service.createTask({
        name: 'Oil',
        consumables: [
          { item_id: '', item_name: 'Oil filter', qty_per_service: 1 },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_consumable' }));
  });

  it('rejects a non-positive qty_per_service', () => {
    const { service } = makeService();
    expect(() =>
      service.createTask({
        name: 'Oil',
        consumables: [
          { item_id: 'item-1', item_name: 'Oil filter', qty_per_service: 0 },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_consumable' }));
  });

  it('listTasks and listAllComputed include consumables via the batched query', () => {
    const { service } = makeService();
    service.createTask({
      name: 'Oil change',
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
      ],
    });
    service.createTask({ name: 'Bilge check' });

    const list = service.listTasks({}).data;
    expect(list.find((t) => t.slug === 'oil-change')?.consumables).toHaveLength(
      1,
    );
    expect(list.find((t) => t.slug === 'bilge-check')?.consumables).toEqual([]);

    const all = service.listAllComputed();
    expect(all.find((t) => t.slug === 'oil-change')?.consumables).toHaveLength(
      1,
    );
  });
});

describe('denormalization invariant (§5.6)', () => {
  it('updates last_* from the newest log entry', async () => {
    const { service } = makeService();
    service.createTask({
      name: 'Oil',
      last_maintenance: '2026-01-01T00:00:00Z',
      last_runtime: 100,
    });
    await service.addLog(
      'oil',
      { maintenance_date: '2026-03-01T00:00:00Z', runtime_hours: 150 },
      null,
    );
    let t = service.getTask('oil');
    expect(t.last_maintenance).toBe('2026-03-01T00:00:00.000Z');
    expect(t.last_runtime).toBe(150);

    // an older entry must NOT displace the newer one
    await service.addLog(
      'oil',
      { maintenance_date: '2026-02-01T00:00:00Z', runtime_hours: 120 },
      null,
    );
    t = service.getTask('oil');
    expect(t.last_maintenance).toBe('2026-03-01T00:00:00.000Z');
  });

  it('recomputes on log edit and delete, falling back to seed values', async () => {
    const { service } = makeService();
    service.createTask({
      name: 'Oil',
      last_maintenance: '2026-01-01T00:00:00Z',
      last_runtime: 100,
    });
    const entry = await service.addLog(
      'oil',
      { maintenance_date: '2026-03-01T00:00:00Z', runtime_hours: 150 },
      null,
    );

    service.updateLog(entry.id, { maintenance_date: '2026-04-01T00:00:00Z' });
    expect(service.getTask('oil').last_maintenance).toBe(
      '2026-04-01T00:00:00.000Z',
    );

    service.deleteLog(entry.id);
    const t = service.getTask('oil');
    expect(t.last_maintenance).toBe('2026-01-01T00:00:00Z'); // seed restored
    expect(t.last_runtime).toBe(100);
  });

  it('seed last_* is only editable while the task has no logs (§8.1)', async () => {
    const { service } = makeService();
    service.createTask({ name: 'Oil' });
    service.updateTask('oil', {
      last_maintenance: '2026-02-01T00:00:00Z',
      last_runtime: 42,
    });
    expect(service.getTask('oil').last_runtime).toBe(42);

    await service.addLog(
      'oil',
      { maintenance_date: '2026-03-01T00:00:00Z', runtime_hours: 99 },
      null,
    );
    service.updateTask('oil', { last_runtime: 1 }); // ignored: has logs
    expect(service.getTask('oil').last_runtime).toBe(99);
  });

  it('informational tasks (no intervals) can be completed and still track last_*', async () => {
    const { service } = makeService({ 'propulsion.port.runTime': 1500 });
    service.createTask({ name: 'Check bilge pump' }); // no intervals at all
    const entry = await service.addLog(
      'check-bilge-pump',
      { maintenance_date: '2026-07-01T00:00:00Z', runtime_hours: 1234.5 },
      'zach',
    );
    expect(entry.runtime_hours).toBe(1234.5);

    const t = service.getTask('check-bilge-pump');
    expect(t.last_maintenance).toBe('2026-07-01T00:00:00.000Z');
    expect(t.last_runtime).toBe(1234.5);
    expect(t.status).toBe('unknown'); // still no due-date/status without an interval
    expect(t.due_date).toBeNull();
  });

  it('stamps logged_by from the caller, and validates maintenance_date', async () => {
    const { service } = makeService();
    service.createTask({ name: 'Oil' });
    const entry = await service.addLog(
      'oil',
      { maintenance_date: '2026-03-01T00:00:00Z' },
      'zach',
    );
    expect(entry.logged_by).toBe('zach');
    await expect(
      service.addLog('oil', { maintenance_date: 'not-a-date' }, null),
    ).rejects.toThrowError(
      expect.objectContaining({ status: 400, code: 'invalid_date' }),
    );
    await expect(service.addLog('oil', {}, null)).rejects.toThrow(ApiError);
  });

  it('shortens device-token principals so the full UUID never leaves the API', async () => {
    const { service } = makeService();
    service.createTask({ name: 'Oil' });
    const token = '158dccd5-f82c-42a3-9909-42ac7d3c8e88';
    const entry = await service.addLog(
      'oil',
      { maintenance_date: '2026-03-01T00:00:00Z' },
      token,
    );
    expect(entry.logged_by).toBe('158dccd5');

    // and via the list paths, not just the create response
    expect(service.listTaskLogs('oil')[0].logged_by).toBe('158dccd5');
    expect(service.listMasterLog({}).data[0].logged_by).toBe('158dccd5');
  });
});

describe('task list query (§8.1)', () => {
  function seed(service: MaintenanceService) {
    // overdue by runtime
    service.createTask({
      name: 'Overdue engine',
      runtime_interval: 100,
      runtime_path: 'propulsion.port.runTime',
      last_runtime: 0,
      tags: ['Engines'],
    });
    // due soon by time (due in 3 days, lead 7)
    service.createTask({
      name: 'Soon zinc check',
      time_interval: 1,
      time_interval_unit: 'weeks',
      last_maintenance: '2026-07-05T12:00:00Z',
      tags: ['Hull'],
    });
    // ok (due in ~6 months)
    service.createTask({
      name: 'Ok watermaker',
      time_interval: 6,
      time_interval_unit: 'months',
      last_maintenance: '2026-07-01T00:00:00Z',
      tags: ['Water', 'Engines'],
    });
    // informational => unknown
    service.createTask({ name: 'Unknown paperwork' });
  }

  it('default sort is urgency order', () => {
    const { service } = makeService({ 'propulsion.port.runTime': 150 });
    seed(service);
    const page = service.listTasks({});
    expect(page.data.map((t) => t.status)).toEqual([
      'overdue',
      'due_soon',
      'ok',
      'unknown',
    ]);
    expect(page.total).toBe(4);
  });

  it('filters by search across name, description, and tags', () => {
    const { service } = makeService({ 'propulsion.port.runTime': 150 });
    seed(service);
    expect(
      service.listTasks({ search: 'zinc' }).data.map((t) => t.name),
    ).toEqual(['Soon zinc check']);
    expect(
      service.listTasks({ search: 'water' }).data.map((t) => t.name),
    ).toEqual(['Ok watermaker']);
  });

  it('searches log notes too (§6.3)', async () => {
    const { service } = makeService();
    seed(service);
    await service.addLog(
      'unknown-paperwork',
      {
        maintenance_date: '2026-07-01T00:00:00Z',
        notes: 'renewed the documentation',
      },
      null,
    );
    expect(
      service.listTasks({ search: 'documentation' }).data.map((t) => t.name),
    ).toEqual(['Unknown paperwork']);
  });

  it('filters by tags (AND) and status', () => {
    const { service } = makeService({ 'propulsion.port.runTime': 150 });
    seed(service);
    expect(service.listTasks({ tags: ['engines'] }).data).toHaveLength(2);
    expect(
      service.listTasks({ tags: ['Engines', 'Water'] }).data.map((t) => t.name),
    ).toEqual(['Ok watermaker']);
    expect(
      service.listTasks({ status: ['overdue', 'due_soon'] }).data,
    ).toHaveLength(2);
  });

  it('sorts by name and by remaining_time with nulls last', () => {
    const { service } = makeService({ 'propulsion.port.runTime': 150 });
    seed(service);
    const byName = service.listTasks({ sort: 'name', order: 'asc' });
    expect(byName.data.map((t) => t.name)).toEqual([
      'Ok watermaker',
      'Overdue engine',
      'Soon zinc check',
      'Unknown paperwork',
    ]);
    const byTime = service.listTasks({ sort: 'remaining_time', order: 'asc' });
    expect(byTime.data.map((t) => t.name)).toEqual([
      'Soon zinc check',
      'Ok watermaker',
      'Overdue engine', // null remaining_time sorts last
      'Unknown paperwork',
    ]);
  });

  it('paginates', () => {
    const { service } = makeService();
    seed(service);
    const p1 = service.listTasks({ page: 1, pageSize: 3 });
    const p2 = service.listTasks({ page: 2, pageSize: 3 });
    expect(p1.data).toHaveLength(3);
    expect(p2.data).toHaveLength(1);
    expect(p1.total).toBe(4);
    expect(p2.page).toBe(2);
  });
});

describe('master log (§8.2)', () => {
  it('lists, searches, sorts, and paginates across tasks', async () => {
    const { service } = makeService();
    service.createTask({ name: 'Alpha' });
    service.createTask({ name: 'Bravo' });
    await service.addLog(
      'alpha',
      { maintenance_date: '2026-01-01T00:00:00Z', notes: 'first' },
      'u1',
    );
    await service.addLog(
      'bravo',
      { maintenance_date: '2026-02-01T00:00:00Z', notes: 'second' },
      'u2',
    );
    await service.addLog(
      'alpha',
      { maintenance_date: '2026-03-01T00:00:00Z', notes: 'third' },
      'u1',
    );

    const all = service.listMasterLog({});
    expect(all.total).toBe(3);
    expect(all.data[0].notes).toBe('third'); // date desc default
    expect(all.data[0].task_slug).toBe('alpha');
    expect(all.data[0].task_name).toBe('Alpha');

    expect(service.listMasterLog({ search: 'second' }).data).toHaveLength(1);
    expect(service.listMasterLog({ search: 'Bravo' }).data).toHaveLength(1); // task name

    const byTask = service.listMasterLog({ sort: 'task', order: 'asc' });
    expect(byTask.data.map((l) => l.task_name)).toEqual([
      'Alpha',
      'Alpha',
      'Bravo',
    ]);

    const paged = service.listMasterLog({ page: 2, pageSize: 2 });
    expect(paged.data).toHaveLength(1);
  });
});

describe('stock consumption on completion (docs/inventory-interaction.md)', () => {
  function stubClient(
    consumeForTask: StowageClient['consumeForTask'],
    consumeFromPlacements?: StowageClient['consumeFromPlacements'],
  ): StowageClient {
    return {
      consumeForTask,
      consumeFromPlacements: consumeFromPlacements ?? vi.fn(),
    } as unknown as StowageClient;
  }

  it('does nothing when no stowageClient is configured', async () => {
    const { service } = makeService(); // no stowageClient
    service.createTask({ name: 'Oil' });
    service.consumables.setForTask(
      service.getTask('oil').id,
      [{ item_id: 'item-1', item_name: 'Filter', qty_per_service: 1 }],
      NOW.toISOString(),
    );
    const entry = await service.addLog(
      'oil',
      { maintenance_date: '2026-07-01T00:00:00Z' },
      null,
    );
    expect(entry.consumable_warnings).toBeUndefined();
  });

  it('does nothing when the task has no linked consumables', async () => {
    const consumeForTask = vi.fn();
    const { service } = makeService({}, stubClient(consumeForTask));
    service.createTask({ name: 'Oil' });
    const entry = await service.addLog(
      'oil',
      { maintenance_date: '2026-07-01T00:00:00Z' },
      null,
    );
    expect(consumeForTask).not.toHaveBeenCalled();
    expect(entry.consumable_warnings).toBeUndefined();
  });

  it('calls consumeForTask for each linked item with a descriptive note', async () => {
    const consumeForTask = vi.fn().mockResolvedValue({});
    const { service } = makeService({}, stubClient(consumeForTask));
    service.createTask({ name: 'Oil change' });
    const taskId = service.getTask('oil-change').id;
    service.consumables.setForTask(
      taskId,
      [
        { item_id: 'item-filter', item_name: 'Filter', qty_per_service: 1 },
        { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 5 },
      ],
      NOW.toISOString(),
    );

    await service.addLog(
      'oil-change',
      { maintenance_date: '2026-07-11T00:00:00Z' },
      null,
    );

    expect(consumeForTask).toHaveBeenCalledTimes(2);
    expect(consumeForTask).toHaveBeenCalledWith(
      'item-filter',
      1,
      'Used for maintenance task: Oil change (2026-07-11)',
      {},
    );
    expect(consumeForTask).toHaveBeenCalledWith(
      'item-oil',
      5,
      'Used for maintenance task: Oil change (2026-07-11)',
      {},
    );
  });

  it('forwards the caller-supplied auth headers', async () => {
    const consumeForTask = vi.fn().mockResolvedValue({});
    const { service } = makeService({}, stubClient(consumeForTask));
    service.createTask({ name: 'Oil' });
    service.consumables.setForTask(
      service.getTask('oil').id,
      [{ item_id: 'item-1', item_name: 'Filter', qty_per_service: 1 }],
      NOW.toISOString(),
    );

    await service.addLog(
      'oil',
      { maintenance_date: '2026-07-01T00:00:00Z' },
      null,
      { cookie: 'JSESSIONID=abc' },
    );

    expect(consumeForTask).toHaveBeenCalledWith(
      'item-1',
      1,
      expect.any(String),
      { cookie: 'JSESSIONID=abc' },
    );
  });

  it('skips consumption when consume_stock is explicitly false', async () => {
    const consumeForTask = vi.fn();
    const { service } = makeService({}, stubClient(consumeForTask));
    service.createTask({ name: 'Oil' });
    service.consumables.setForTask(
      service.getTask('oil').id,
      [{ item_id: 'item-1', item_name: 'Filter', qty_per_service: 1 }],
      NOW.toISOString(),
    );

    await service.addLog(
      'oil',
      { maintenance_date: '2026-07-01T00:00:00Z', consume_stock: false },
      null,
    );

    expect(consumeForTask).not.toHaveBeenCalled();
  });

  it('the log entry still succeeds when stowage-mgmt is unreachable, with no warning', async () => {
    const consumeForTask = vi
      .fn()
      .mockRejectedValue(new StowageUnavailableError('connection refused'));
    const { service } = makeService({}, stubClient(consumeForTask));
    service.createTask({ name: 'Oil' });
    service.consumables.setForTask(
      service.getTask('oil').id,
      [{ item_id: 'item-1', item_name: 'Filter', qty_per_service: 1 }],
      NOW.toISOString(),
    );

    const entry = await service.addLog(
      'oil',
      { maintenance_date: '2026-07-01T00:00:00Z' },
      null,
    );

    expect(entry.id).toBeDefined(); // the log itself was not rolled back
    expect(entry.consumable_warnings).toBeUndefined();
  });

  it('the log entry still succeeds when a real stowage-mgmt error occurs, with a warning', async () => {
    const consumeForTask = vi
      .fn()
      .mockRejectedValueOnce(new Error('item is split across locations'))
      .mockResolvedValueOnce({});
    const { service } = makeService({}, stubClient(consumeForTask));
    service.createTask({ name: 'Oil' });
    service.consumables.setForTask(
      service.getTask('oil').id,
      [
        { item_id: 'item-split', item_name: 'Zincs', qty_per_service: 1 },
        { item_id: 'item-fine', item_name: 'Filter', qty_per_service: 1 },
      ],
      NOW.toISOString(),
    );

    const entry = await service.addLog(
      'oil',
      { maintenance_date: '2026-07-01T00:00:00Z' },
      null,
    );

    expect(entry.id).toBeDefined();
    expect(entry.consumable_warnings).toEqual([
      'item is split across locations',
    ]);
    expect(consumeForTask).toHaveBeenCalledTimes(2); // one failure doesn't stop the rest
  });

  it('routes an item with a matching consumable_allocations entry through consumeFromPlacements', async () => {
    const consumeForTask = vi.fn().mockResolvedValue({});
    const consumeFromPlacements = vi.fn().mockResolvedValue({});
    const { service } = makeService(
      {},
      stubClient(consumeForTask, consumeFromPlacements),
    );
    service.createTask({ name: 'Zinc replacement' });
    service.consumables.setForTask(
      service.getTask('zinc-replacement').id,
      [{ item_id: 'item-split', item_name: 'Zincs', qty_per_service: 3 }],
      NOW.toISOString(),
    );

    await service.addLog(
      'zinc-replacement',
      {
        maintenance_date: '2026-07-11T00:00:00Z',
        consumable_allocations: [
          {
            item_id: 'item-split',
            placements: [
              { placement_id: 'placement-1', quantity: 2 },
              { placement_id: 'placement-2', quantity: 1 },
            ],
          },
        ],
      },
      null,
    );

    expect(consumeFromPlacements).toHaveBeenCalledWith(
      'item-split',
      [
        { placement_id: 'placement-1', quantity: 2 },
        { placement_id: 'placement-2', quantity: 1 },
      ],
      expect.stringContaining('Zinc replacement'),
      {},
    );
    expect(consumeForTask).not.toHaveBeenCalled();
  });

  it('falls back to consumeForTask for a linked item with no matching allocation entry', async () => {
    const consumeForTask = vi.fn().mockResolvedValue({});
    const consumeFromPlacements = vi.fn().mockResolvedValue({});
    const { service } = makeService(
      {},
      stubClient(consumeForTask, consumeFromPlacements),
    );
    service.createTask({ name: 'Oil change' });
    service.consumables.setForTask(
      service.getTask('oil-change').id,
      [{ item_id: 'item-filter', item_name: 'Filter', qty_per_service: 1 }],
      NOW.toISOString(),
    );

    await service.addLog(
      'oil-change',
      {
        maintenance_date: '2026-07-11T00:00:00Z',
        consumable_allocations: [
          {
            item_id: 'item-other', // doesn't match the linked item
            placements: [{ placement_id: 'placement-1', quantity: 1 }],
          },
        ],
      },
      null,
    );

    expect(consumeForTask).toHaveBeenCalledWith(
      'item-filter',
      1,
      expect.any(String),
      {},
    );
    expect(consumeFromPlacements).not.toHaveBeenCalled();
  });

  it('a per-placement allocation failure produces a warning without blocking the log', async () => {
    const consumeForTask = vi.fn();
    const consumeFromPlacements = vi
      .fn()
      .mockRejectedValue(
        new Error('Not enough "Zincs" at Engine room (have 2, need 3)'),
      );
    const { service } = makeService(
      {},
      stubClient(consumeForTask, consumeFromPlacements),
    );
    service.createTask({ name: 'Zinc replacement' });
    service.consumables.setForTask(
      service.getTask('zinc-replacement').id,
      [{ item_id: 'item-split', item_name: 'Zincs', qty_per_service: 3 }],
      NOW.toISOString(),
    );

    const entry = await service.addLog(
      'zinc-replacement',
      {
        maintenance_date: '2026-07-11T00:00:00Z',
        consumable_allocations: [
          {
            item_id: 'item-split',
            placements: [{ placement_id: 'placement-1', quantity: 3 }],
          },
        ],
      },
      null,
    );

    expect(entry.id).toBeDefined();
    expect(entry.consumable_warnings).toEqual([
      'Not enough "Zincs" at Engine room (have 2, need 3)',
    ]);
  });
});
