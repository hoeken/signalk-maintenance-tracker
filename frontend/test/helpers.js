import { vi } from 'vitest';

/**
 * Install a fetch mock that answers by first matching "METHOD pathprefix"
 * route key (e.g. 'GET /plugins/signalk-maintenance-tracker/api/tasks').
 * Returns the vi.fn so calls can be asserted.
 *
 * @param {Array<{match: (method: string, url: string) => boolean, status?: number, body?: any}>} routes
 */
export function mockFetch(routes) {
  const fn = vi.fn(async (url, init) => {
    const method = init && init.method ? init.method : 'GET';
    for (const routeDef of routes) {
      if (routeDef.match(method, String(url))) {
        const status = routeDef.status || 200;
        const body = routeDef.body === undefined ? null : routeDef.body;
        // 204/205/304 must have a null body per the Response constructor
        return new Response(
          body === null || status === 204 ? null : JSON.stringify(body),
          {
            status,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
    }
    return new Response(
      JSON.stringify({
        error: {
          code: 'not_found',
          message: 'no mock for ' + method + ' ' + url,
        },
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Standard API-shaped routes for pages: tasks list, tags, logs. */
export function apiRoutes(overrides) {
  const o = overrides || {};
  const tasks = o.tasks || [];
  const logs = o.logs || [];
  const tags = o.tags || [];
  return [
    {
      match: (m, u) => m === 'GET' && u.indexOf('/api/tasks?') !== -1,
      body: { data: tasks, total: tasks.length, page: 1, pageSize: 20 },
    },
    {
      match: (m, u) => m === 'GET' && u.indexOf('/api/logs') !== -1,
      body: { data: logs, total: logs.length, page: 1, pageSize: 25 },
    },
    {
      match: (m, u) => m === 'GET' && u.indexOf('/api/tags') !== -1,
      body: { data: tags },
    },
  ];
}

/** Build a full TaskDTO with sane defaults. */
export function makeTask(overrides) {
  return Object.assign(
    {
      id: 1,
      slug: 'engine-oil-change',
      name: 'Engine oil change',
      description: null,
      tags: [],
      runtime_interval: 200,
      time_interval: 12,
      time_interval_unit: 'months',
      runtime_path: 'propulsion.port.runTime',
      due_date: null,
      last_maintenance: '2026-01-15T10:00:00.000Z',
      last_runtime: 1240.5,
      current_runtime: 1360,
      elapsed_runtime: 119.5,
      remaining_runtime: 80.5,
      due_runtime_at: 1440.5,
      runtime_fraction: 0.5975,
      runtime_status: 'ok',
      scheduled_due_date: '2027-01-15T10:00:00.000Z',
      scheduled_remaining_ms: 16675200000,
      scheduled_fraction: 0.48,
      scheduled_status: 'ok',
      due_date_remaining_ms: null,
      due_date_fraction: null,
      due_date_status: null,
      remaining_time_ms: 16675200000,
      time_fraction: 0.48,
      time_status: 'ok',
      status: 'ok',
      status_rank: 2,
      urgency: 0.5975,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      consumables: [],
    },
    overrides || {},
  );
}
