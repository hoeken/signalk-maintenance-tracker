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
      runtime_warning_hours: null,
      time_warning_days: null,
      last_maintenance: '2026-01-15T10:00:00.000Z',
      last_runtime: 1240.5,
      current_runtime: 1360,
      elapsed_runtime: 119.5,
      remaining_runtime: 80.5,
      due_runtime_at: 1440.5,
      runtime_fraction: 0.5975,
      runtime_status: 'ok',
      elapsed_time_ms: 15552000000,
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
      is_archived: false,
      is_recurring: true,
      status: 'ok',
      status_rank: 3,
      urgency: 0.5975,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      consumables: [],
      files: [],
    },
    overrides || {},
  );
}

/**
 * Read back a stored (uncompressed) zip from its central directory:
 * path → bytes, plus each entry's CRC as written, for checking zip.js output.
 * @param {Blob} blob
 */
export async function readZip(blob) {
  // jsdom's Blob has no arrayBuffer(); FileReader works
  const buf = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () =>
      resolve(new Uint8Array(/** @type {ArrayBuffer} */ (r.result)));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
  const view = new DataView(buf.buffer);
  const eocd = buf.length - 22;
  if (view.getUint32(eocd, true) !== 0x06054b50) throw new Error('no EOCD');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  /** @type {Map<string, { data: Uint8Array, crc: number, flags: number }>} */
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad CD');
    const flags = view.getUint16(p + 8, true);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('bad LFH');
    const start = local + 30 + view.getUint16(local + 26, true);
    out.set(name, { data: buf.slice(start, start + size), crc, flags });
    p += 46 + nameLen;
  }
  return out;
}
