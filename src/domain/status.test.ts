import { describe, expect, it } from 'vitest';
import { addInterval, computeTask, StatusConfig } from './status';

const cfg: StatusConfig = { runtimeNotifyLeadHours: 10, timeNotifyLeadDays: 7 };
const now = new Date('2026-07-09T12:00:00Z');

const baseTask = {
  runtime_interval: null as number | null,
  time_interval: null as number | null,
  time_interval_unit: null as any,
  runtime_path: null as string | null,
  last_maintenance: null as string | null,
  last_runtime: null as number | null,
};

describe('addInterval', () => {
  it('adds days and weeks', () => {
    expect(addInterval('2026-01-01T00:00:00Z', 10, 'days').toISOString()).toBe(
      '2026-01-11T00:00:00.000Z'
    );
    expect(addInterval('2026-01-01T00:00:00Z', 2, 'weeks').toISOString()).toBe(
      '2026-01-15T00:00:00.000Z'
    );
  });

  it('respects month lengths (calendar-aware)', () => {
    // Jan 31 + 1 month clamps to Feb 28 (2026 is not a leap year)
    expect(addInterval('2026-01-31T00:00:00Z', 1, 'months').toISOString()).toBe(
      '2026-02-28T00:00:00.000Z'
    );
    expect(addInterval('2026-01-15T10:00:00Z', 6, 'months').toISOString()).toBe(
      '2026-07-15T10:00:00.000Z'
    );
  });

  it('handles leap-day years', () => {
    expect(addInterval('2028-02-29T00:00:00Z', 1, 'years').toISOString()).toBe(
      '2029-02-28T00:00:00.000Z'
    );
  });
});

describe('computeTask — runtime dimension', () => {
  const task = {
    ...baseTask,
    runtime_interval: 200,
    runtime_path: 'propulsion.port.runTime',
    last_runtime: 1000,
  };

  it('computes elapsed/remaining/due/fraction', () => {
    const c = computeTask(task, 1119.5, now, cfg);
    expect(c.elapsed_runtime).toBeCloseTo(119.5);
    expect(c.remaining_runtime).toBeCloseTo(80.5);
    expect(c.due_runtime_at).toBeCloseTo(1200);
    expect(c.runtime_fraction).toBeCloseTo(0.5975);
    expect(c.status).toBe('ok');
  });

  it('is due_soon inside the lead window', () => {
    const c = computeTask(task, 1195, now, cfg); // 5h remaining <= 10h lead
    expect(c.status).toBe('due_soon');
  });

  it('is overdue at or past the interval', () => {
    const c = computeTask(task, 1220, now, cfg);
    expect(c.status).toBe('overdue');
    expect(c.remaining_runtime).toBeCloseTo(-20);
  });

  it('is unknown when no runtime value has been seen', () => {
    const c = computeTask(task, null, now, cfg);
    expect(c.runtime_status).toBe('unknown');
    expect(c.status).toBe('unknown');
    expect(c.remaining_runtime).toBeNull();
  });

  it('is unknown when last_runtime is missing', () => {
    const c = computeTask({ ...task, last_runtime: null }, 1100, now, cfg);
    expect(c.runtime_status).toBe('unknown');
  });
});

describe('computeTask — time dimension', () => {
  const task = {
    ...baseTask,
    time_interval: 6,
    time_interval_unit: 'months' as const,
    last_maintenance: '2026-01-09T12:00:00Z',
  };

  it('computes due date and remaining time', () => {
    const c = computeTask(task, null, now, cfg);
    expect(c.due_date).toBe('2026-07-09T12:00:00.000Z');
    expect(c.remaining_time_ms).toBe(0);
    expect(c.status).toBe('overdue'); // remaining <= 0
  });

  it('is ok well before due', () => {
    const c = computeTask({ ...task, last_maintenance: '2026-07-01T00:00:00Z' }, null, now, cfg);
    expect(c.status).toBe('ok');
    expect(c.time_fraction).toBeGreaterThan(0);
    expect(c.time_fraction).toBeLessThan(1);
  });

  it('is due_soon within the lead window', () => {
    // due 2026-07-14, 5 days away, lead 7 days
    const c = computeTask(
      { ...baseTask, time_interval: 1, time_interval_unit: 'weeks', last_maintenance: '2026-07-07T12:00:00Z' },
      null,
      now,
      cfg
    );
    expect(c.status).toBe('due_soon');
  });

  it('is unknown without last_maintenance', () => {
    const c = computeTask({ ...task, last_maintenance: null }, null, now, cfg);
    expect(c.time_status).toBe('unknown');
    expect(c.status).toBe('unknown');
  });
});

describe('computeTask — combined & edge cases', () => {
  it('overall status is the most urgent dimension', () => {
    const c = computeTask(
      {
        runtime_interval: 200,
        runtime_path: 'p',
        last_runtime: 1000,
        time_interval: 12,
        time_interval_unit: 'months',
        last_maintenance: '2026-06-01T00:00:00Z',
      },
      1250, // runtime overdue
      now,
      cfg
    );
    expect(c.runtime_status).toBe('overdue');
    expect(c.time_status).toBe('ok');
    expect(c.status).toBe('overdue');
    expect(c.status_rank).toBe(0);
  });

  it('unknown in one dimension does not mask ok in the other', () => {
    const c = computeTask(
      {
        runtime_interval: 200,
        runtime_path: 'p',
        last_runtime: null, // unknown
        time_interval: 12,
        time_interval_unit: 'months',
        last_maintenance: '2026-06-01T00:00:00Z', // ok
      },
      null,
      now,
      cfg
    );
    expect(c.status).toBe('ok');
  });

  it('informational-only tasks (no intervals) are unknown with no computed fields', () => {
    const c = computeTask(baseTask, null, now, cfg);
    expect(c.status).toBe('unknown');
    expect(c.runtime_status).toBeNull();
    expect(c.time_status).toBeNull();
    expect(c.due_date).toBeNull();
    expect(c.remaining_runtime).toBeNull();
  });

  it('runtime dimension requires both interval and path', () => {
    const c = computeTask(
      { ...baseTask, runtime_interval: 100, last_runtime: 50 }, // no path
      75,
      now,
      cfg
    );
    expect(c.runtime_status).toBeNull();
  });
});
