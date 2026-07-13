import { describe, expect, it, vi } from 'vitest';
import { TaskDTO } from '../types';
import { buildMessage, NotificationManager } from './notifications';

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
  const manager = new NotificationManager(app, 'signalk-maintenance-tracker', {
    enableNotifications: enabled,
    alarmStateOk: 'none',
    alarmStateDueSoon: 'warn',
    alarmStateOverdue: 'alarm',
  });
  return { app, manager };
}

function sentValues(app: { handleMessage: ReturnType<typeof vi.fn> }) {
  return app.handleMessage.mock.calls.map((c) => c[1].updates[0].values[0]);
}

describe('NotificationManager (§10.3)', () => {
  it('publishes to notifications.maintenance.{slug} with correct state mapping', () => {
    const { app, manager } = makeManager();
    manager.publishAll([
      makeTask({
        slug: 'a',
        status: 'overdue',
        runtime_status: 'overdue',
        remaining_runtime: -20,
      }),
      makeTask({
        slug: 'b',
        status: 'due_soon',
        time_status: 'due_soon',
        remaining_time_ms: 3 * 86_400_000,
      }),
      makeTask({ slug: 'c', status: 'ok' }),
    ]);
    const values = sentValues(app);
    expect(
      values.map((v) => [v.path, v.value === null ? null : v.value.state]),
    ).toEqual([
      ['notifications.maintenance.a', 'alarm'],
      ['notifications.maintenance.b', 'warn'],
      ['notifications.maintenance.c', null], // ok → none → null value
    ]);
    expect(values[0].value.method).toEqual(['visual']);
    expect(values[0].value.message).toContain('overdue by 20 runtime hours');
    expect(values[1].value.message).toContain('due in 3 days');
  });

  it('deduplicates: republishing the same state sends nothing', () => {
    const { app, manager } = makeManager();
    const task = makeTask({
      status: 'overdue',
      runtime_status: 'overdue',
      remaining_runtime: -5,
    });
    manager.publishAll([task]);
    manager.publishAll([task]);
    expect(app.handleMessage).toHaveBeenCalledTimes(1);

    manager.publishAll([makeTask({ status: 'ok' })]); // state change → publish
    expect(app.handleMessage).toHaveBeenCalledTimes(2);
  });

  it('publishes nothing for unknown status, but clears a prior alarm', () => {
    const { app, manager } = makeManager();
    manager.publishAll([makeTask({ status: 'unknown' })]);
    expect(app.handleMessage).not.toHaveBeenCalled();

    manager.publishAll([
      makeTask({ status: 'overdue', runtime_status: 'overdue' }),
    ]);
    manager.publishAll([makeTask({ status: 'unknown' })]);
    const values = sentValues(app);
    expect(values.at(-1)?.value).toBeNull();
  });

  it('clear() nulls out a slug (delete / rename migration §6.4)', () => {
    const { app, manager } = makeManager();
    manager.clear('old-slug');
    const values = sentValues(app);
    expect(values[0].path).toBe('notifications.maintenance.old-slug');
    expect(values[0].value).toBeNull();
  });

  it('is silent when notifications are disabled', () => {
    const { app, manager } = makeManager(false);
    manager.publishAll([
      makeTask({ status: 'overdue', runtime_status: 'overdue' }),
    ]);
    manager.clear('x');
    expect(app.handleMessage).not.toHaveBeenCalled();
  });
});

describe('buildMessage', () => {
  it('names the dimension that triggered the status', () => {
    expect(
      buildMessage(
        makeTask({
          status: 'overdue',
          runtime_status: 'overdue',
          remaining_runtime: -20.04,
        }),
      ),
    ).toBe('Engine oil change is overdue by 20 runtime hours');

    expect(
      buildMessage(
        makeTask({
          status: 'overdue',
          time_status: 'overdue',
          remaining_time_ms: -86_400_000,
        }),
      ),
    ).toBe('Engine oil change is overdue by 1 day');

    expect(
      buildMessage(
        makeTask({
          status: 'due_soon',
          runtime_status: 'due_soon',
          remaining_runtime: 8.26,
        }),
      ),
    ).toBe('Engine oil change is due in 8.3 runtime hours');
  });

  it('when both dimensions trigger, the further-along one wins', () => {
    const msg = buildMessage(
      makeTask({
        status: 'overdue',
        runtime_status: 'overdue',
        time_status: 'overdue',
        runtime_fraction: 1.1,
        time_fraction: 1.5,
        remaining_runtime: -10,
        remaining_time_ms: -5 * 86_400_000,
      }),
    );
    expect(msg).toBe('Engine oil change is overdue by 5 days');
  });
});
