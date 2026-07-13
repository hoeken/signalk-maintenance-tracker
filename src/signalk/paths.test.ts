import { describe, expect, it, vi } from 'vitest';
import { TaskDTO } from '../types';
import { PathPublisher } from './paths';

function makeTask(overrides: Partial<TaskDTO>): TaskDTO {
  return {
    id: 1,
    slug: 'engine-oil-change',
    name: 'Engine oil change',
    description: null,
    tags: [],
    runtime_interval: null,
    time_interval: null,
    time_interval_unit: null,
    runtime_path: null,
    runtime_warning_hours: null,
    time_warning_days: null,
    last_maintenance: null,
    last_runtime: null,
    created_at: '',
    updated_at: '',
    current_runtime: null,
    elapsed_runtime: null,
    remaining_runtime: null,
    due_runtime_at: null,
    runtime_fraction: null,
    runtime_status: null,
    due_date: null,
    scheduled_due_date: null,
    scheduled_remaining_ms: null,
    scheduled_fraction: null,
    scheduled_status: null,
    due_date_remaining_ms: null,
    due_date_fraction: null,
    due_date_status: null,
    remaining_time_ms: null,
    time_fraction: null,
    time_status: null,
    status: 'ok',
    status_rank: 2,
    urgency: 0,
    ...overrides,
  };
}

function makeManager(enabled = true) {
  const app = { handleMessage: vi.fn() };
  const manager = new PathPublisher(app, 'signalk-maintenance-tracker', {
    enablePublishPaths: enabled,
  });
  return { app, manager };
}

function lastValues(app: { handleMessage: ReturnType<typeof vi.fn> }) {
  const call = app.handleMessage.mock.calls.at(-1);
  return call?.[1].updates[0].values as { path: string; value: unknown }[];
}

describe('PathPublisher', () => {
  it('publishes the task DTO under .data and status under .status', () => {
    const { app, manager } = makeManager();
    const task = makeTask({ slug: 'a', status: 'overdue' });
    manager.publishAll([task]);
    expect(lastValues(app)).toEqual([
      { path: 'maintenance.a.data', value: task },
      { path: 'maintenance.a.status', value: 'overdue' },
    ]);
  });

  it('batches all tasks into a single delta', () => {
    const { app, manager } = makeManager();
    manager.publishAll([
      makeTask({ slug: 'a' }),
      makeTask({ slug: 'b', status: 'due_soon' }),
    ]);
    expect(app.handleMessage).toHaveBeenCalledTimes(1);
    expect(lastValues(app).map((v) => v.path)).toEqual([
      'maintenance.a.data',
      'maintenance.a.status',
      'maintenance.b.data',
      'maintenance.b.status',
    ]);
  });

  it('deduplicates: republishing an unchanged task sends nothing', () => {
    const { app, manager } = makeManager();
    const task = makeTask({ slug: 'a', status: 'ok' });
    manager.publishAll([task]);
    manager.publishAll([task]);
    expect(app.handleMessage).toHaveBeenCalledTimes(1);

    manager.publishAll([makeTask({ slug: 'a', status: 'overdue' })]);
    expect(app.handleMessage).toHaveBeenCalledTimes(2);
  });

  it('clear() nulls out both paths for a slug', () => {
    const { app, manager } = makeManager();
    manager.clear('old-slug');
    expect(lastValues(app)).toEqual([
      { path: 'maintenance.old-slug.data', value: null },
      { path: 'maintenance.old-slug.status', value: null },
    ]);
  });

  it('re-publishes after clear even if the payload is unchanged', () => {
    const { app, manager } = makeManager();
    const task = makeTask({ slug: 'a', status: 'ok' });
    manager.publishAll([task]);
    manager.clear('a');
    manager.publishAll([task]);
    expect(app.handleMessage).toHaveBeenCalledTimes(3);
  });

  it('is silent when publishing is disabled', () => {
    const { app, manager } = makeManager(false);
    manager.publishAll([makeTask({ slug: 'a', status: 'overdue' })]);
    manager.clear('a');
    expect(app.handleMessage).not.toHaveBeenCalled();
  });
});
