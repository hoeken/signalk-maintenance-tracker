import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/database';
import { MaintenanceService } from '../service';
import { StowageClient } from '../stowage/client';
import { mountApi, Services } from './router';

/**
 * REST API tests (§8) — the router exercised through Express with the SignalK
 * side stubbed. SignalK's authorization happens before requests reach the
 * router, so there is deliberately no auth here (§9).
 */

let app: express.Express;
let servicesRef: Services | null;

function makeApp(runtimeValues: Record<string, number> = {}) {
  const db = openDatabase(':memory:');
  const service = new MaintenanceService(db, {
    getRuntime: (p) => runtimeValues[p] ?? null,
    config: { runtimeNotifyLeadHours: 10, timeNotifyLeadDays: 7 },
  });
  const runtimeStub = {
    subscribedPaths: Object.keys(runtimeValues),
    lastUpdateAt: null,
  } as unknown as Services['runtime'];
  servicesRef = { service, runtime: runtimeStub, version: '0.1.0-test' };

  app = express();
  const router = express.Router();
  // simulate a SignalK request principal for logged_by stamping (§9.1)
  router.use((req, _res, next) => {
    (req as any).skPrincipal = { identifier: 'admin' };
    next();
  });
  mountApi(router, () => servicesRef);
  app.use('/plugins/signalk-maintenance-tracker', router);
  return service;
}

/** Separate app instance with a stowageClient configured, for the
 * stock-consumption integration test (docs/inventory-interaction.md). */
function makeAppWithStowage(stowageClient: StowageClient) {
  const db = openDatabase(':memory:');
  const service = new MaintenanceService(db, {
    getRuntime: () => null,
    config: { runtimeNotifyLeadHours: 10, timeNotifyLeadDays: 7 },
    stowageClient,
  });
  const runtimeStub = {
    subscribedPaths: [],
    lastUpdateAt: null,
  } as unknown as Services['runtime'];
  const services: Services = {
    service,
    runtime: runtimeStub,
    version: '0.1.0-test',
  };

  const stowageAppInstance = express();
  const router = express.Router();
  router.use((req, _res, next) => {
    (req as any).skPrincipal = { identifier: 'admin' };
    next();
  });
  mountApi(router, () => services);
  stowageAppInstance.use('/plugins/signalk-maintenance-tracker', router);
  return {
    app: stowageAppInstance,
    base: '/plugins/signalk-maintenance-tracker/api',
    service,
  };
}

const base = '/plugins/signalk-maintenance-tracker/api';

beforeEach(() => {
  makeApp({ 'propulsion.port.runTime': 1360 });
});

describe('tasks endpoints', () => {
  it('POST /tasks creates and GET /tasks lists with computed fields', async () => {
    const create = await request(app)
      .post(`${base}/tasks`)
      .send({
        name: 'Engine oil change',
        runtime_interval: 200,
        runtime_path: 'propulsion.port.runTime',
        last_runtime: 1240.5,
        tags: ['Engines'],
      });
    expect(create.status).toBe(201);
    expect(create.body.slug).toBe('engine-oil-change');
    expect(create.body.remaining_runtime).toBeCloseTo(80.5);

    const list = await request(app).get(`${base}/tasks`);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1, page: 1 });
    expect(list.body.data[0].tags).toEqual(['Engines']);
  });

  it('round-trips linked consumables through POST/GET/PUT /tasks', async () => {
    const create = await request(app)
      .post(`${base}/tasks`)
      .send({
        name: 'Oil change',
        consumables: [
          {
            item_id: 'item-filter',
            item_name: 'Oil filter',
            qty_per_service: 1,
          },
        ],
      });
    expect(create.status).toBe(201);
    expect(create.body.consumables).toEqual([
      { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
    ]);

    const detail = await request(app).get(`${base}/tasks/oil-change`);
    expect(detail.body.consumables).toEqual(create.body.consumables);

    const updated = await request(app)
      .put(`${base}/tasks/oil-change`)
      .send({
        consumables: [
          { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 5 },
        ],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.consumables).toEqual([
      { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 5 },
    ]);
  });

  it('rejects an invalid consumable with a 400', async () => {
    const res = await request(app)
      .post(`${base}/tasks`)
      .send({
        name: 'Oil change',
        consumables: [{ item_id: '', item_name: '', qty_per_service: 1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_consumable');
  });

  it('GET /tasks supports search/status/sort/pagination params', async () => {
    await request(app).post(`${base}/tasks`).send({ name: 'Zeta' });
    await request(app).post(`${base}/tasks`).send({ name: 'Alpha' });
    const res = await request(app).get(
      `${base}/tasks?sort=name&order=desc&page=1&pageSize=1`,
    );
    expect(res.body.data[0].name).toBe('Zeta');
    expect(res.body.total).toBe(2);
    expect(res.body.pageSize).toBe(1);

    const filtered = await request(app).get(
      `${base}/tasks?status=unknown&search=alp`,
    );
    expect(filtered.body.data.map((t: any) => t.name)).toEqual(['Alpha']);
  });

  it('GET/PUT/DELETE /tasks/:slug round-trip', async () => {
    await request(app).post(`${base}/tasks`).send({ name: 'Winch service' });

    const got = await request(app).get(`${base}/tasks/winch-service`);
    expect(got.status).toBe(200);
    expect(got.body.name).toBe('Winch service');

    const put = await request(app)
      .put(`${base}/tasks/winch-service`)
      .send({ description: 'Grease annually', slug: 'winches' });
    expect(put.status).toBe(200);
    expect(put.body.slug).toBe('winches');

    const del = await request(app).delete(`${base}/tasks/winches`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`${base}/tasks/winches`)).status).toBe(404);
  });

  it('returns spec error shapes', async () => {
    const missing = await request(app).get(`${base}/tasks/nope`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: { code: 'not_found', message: expect.stringContaining('nope') },
    });

    const invalid = await request(app)
      .post(`${base}/tasks`)
      .send({ time_interval: 3, name: 'X' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('invalid_interval');

    await request(app).post(`${base}/tasks`).send({ name: 'Dup', slug: 'dup' });
    const conflict = await request(app)
      .post(`${base}/tasks`)
      .send({ name: 'Dup2', slug: 'dup' });
    expect(conflict.status).toBe(409);
  });

  it('rejects malformed JSON bodies with 400', async () => {
    const res = await request(app)
      .post(`${base}/tasks`)
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
  });
});

describe('log endpoints', () => {
  it('POST /tasks/:slug/logs stamps logged_by from the principal, not the body', async () => {
    await request(app).post(`${base}/tasks`).send({ name: 'Oil' });
    const res = await request(app).post(`${base}/tasks/oil/logs`).send({
      maintenance_date: '2026-07-08T14:30:00Z',
      runtime_hours: 1360,
      notes: 'done',
      logged_by: 'spoofed',
    });
    expect(res.status).toBe(201);
    expect(res.body.logged_by).toBe('admin');

    const logs = await request(app).get(`${base}/tasks/oil/logs`);
    expect(logs.body.data).toHaveLength(1);

    // denormalized onto the task
    const task = await request(app).get(`${base}/tasks/oil`);
    expect(task.body.last_maintenance).toBe('2026-07-08T14:30:00.000Z');
    expect(task.body.last_runtime).toBe(1360);
  });

  it('forwards the request cookie to stowage-mgmt when consuming linked stock', async () => {
    const consumeForTask = vi.fn().mockResolvedValue({});
    const stowageApp = makeAppWithStowage({
      consumeForTask,
    } as unknown as StowageClient);

    await request(stowageApp.app)
      .post(`${stowageApp.base}/tasks`)
      .send({ name: 'Winch service' });
    const task = await request(stowageApp.app).get(
      `${stowageApp.base}/tasks/winch-service`,
    );
    stowageApp.service.consumables.setForTask(
      task.body.id,
      [{ item_id: 'item-grease', item_name: 'Grease', qty_per_service: 2 }],
      new Date().toISOString(),
    );

    const res = await request(stowageApp.app)
      .post(`${stowageApp.base}/tasks/winch-service/logs`)
      .set('Cookie', 'JSESSIONID=abc123')
      .send({ maintenance_date: '2026-07-11T00:00:00Z' });

    expect(res.status).toBe(201);
    expect(consumeForTask).toHaveBeenCalledWith(
      'item-grease',
      2,
      expect.stringContaining('Winch service'),
      expect.objectContaining({ cookie: 'JSESSIONID=abc123' }),
    );
  });

  it('GET /logs master log with task fields; PUT/DELETE /logs/:id', async () => {
    await request(app).post(`${base}/tasks`).send({ name: 'Oil' });
    const created = await request(app)
      .post(`${base}/tasks/oil/logs`)
      .send({ maintenance_date: '2026-07-08T14:30:00Z', notes: 'original' });

    const master = await request(app).get(`${base}/logs`);
    expect(master.body.total).toBe(1);
    expect(master.body.data[0]).toMatchObject({
      task_slug: 'oil',
      task_name: 'Oil',
    });

    const put = await request(app)
      .put(`${base}/logs/${created.body.id}`)
      .send({ notes: 'edited' });
    expect(put.status).toBe(200);
    expect(put.body.notes).toBe('edited');

    const del = await request(app).delete(`${base}/logs/${created.body.id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`${base}/logs`)).body.total).toBe(0);

    expect((await request(app).put(`${base}/logs/999`).send({})).status).toBe(
      404,
    );
    expect((await request(app).put(`${base}/logs/abc`).send({})).status).toBe(
      400,
    );
  });
});

describe('tags & health endpoints', () => {
  it('GET /tags returns usage counts', async () => {
    await request(app)
      .post(`${base}/tasks`)
      .send({ name: 'A', tags: ['Engines'] });
    await request(app)
      .post(`${base}/tasks`)
      .send({ name: 'B', tags: ['Engines', 'Hull'] });
    const res = await request(app).get(`${base}/tags`);
    expect(res.body.data).toEqual([
      { id: expect.any(Number), name: 'Engines', count: 2 },
      { id: expect.any(Number), name: 'Hull', count: 1 },
    ]);
  });

  it('GET /health reports counts, paths, version', async () => {
    await request(app).post(`${base}/tasks`).send({
      name: 'A',
      runtime_interval: 10,
      runtime_path: 'propulsion.port.runTime',
    });
    const res = await request(app).get(`${base}/health`);
    expect(res.body).toMatchObject({
      tasks: 1,
      logEntries: 0,
      runtimePaths: ['propulsion.port.runTime'],
      version: '0.1.0-test',
      defaults: { runtime_warning_hours: 10, time_warning_days: 7 },
    });
  });

  it('responds 503 before the plugin has started', async () => {
    servicesRef = null;
    const res = await request(app).get(`${base}/tasks`);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('not_started');
  });
});
