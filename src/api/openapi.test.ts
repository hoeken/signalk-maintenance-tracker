import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv-draft-04';
import express from 'express';
import request from 'supertest';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import createPlugin from '../index';
import { openDatabase } from '../db/database';
import { FileStore } from '../files/store';
import { MaintenanceService } from '../service';
import { getOpenApi } from './openapi';
import { mountApi, Services } from './router';

let document: any;
const ajv = new Ajv({ strict: false, allErrors: true });

beforeAll(async () => {
  // Validate the actual JSON document, including OpenAPI structure and refs.
  document = await SwaggerParser.validate(
    JSON.parse(JSON.stringify(getOpenApi('test'))),
  );
});

function valid(schema: any, value: unknown): void {
  const validate = ajv.compile(schema);
  expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
}

describe('OpenAPI discovery contract', () => {
  it('is available before start without touching application services', () => {
    const app = { getDataDirPath: vi.fn() };
    const plugin = createPlugin(app);
    const spec = plugin.getOpenApi();
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.version).toBeTypeOf('string');
    expect(spec.servers).toEqual([
      { url: '/plugins/signalk-maintenance-tracker' },
    ]);
    expect(app.getDataDirPath).not.toHaveBeenCalled();
    expect(spec.paths).toEqual(getOpenApi('test').paths);
  });

  it('describes every mounted method/path exactly once with unique operation IDs', () => {
    const router = express.Router();
    mountApi(router, () => null);
    const actual = router.stack.flatMap((layer: any) =>
      layer.route
        ? Object.keys(layer.route.methods).map(
            (method) =>
              `${method} ${layer.route.path.replace(/:([A-Za-z]+)/g, '{parameter}')}`,
          )
        : [],
    );
    const documented: string[] = [];
    const ids: string[] = [];
    for (const [route, item] of Object.entries(document.paths) as [
      string,
      any,
    ][]) {
      for (const method of ['get', 'post', 'put', 'delete']) {
        if (!item[method]) continue;
        documented.push(
          `${method} ${route.replace(/\{[^}]+\}/g, '{parameter}')}`,
        );
        ids.push(item[method].operationId);
        const params = [
          ...(item.parameters ?? []),
          ...(item[method].parameters ?? []),
        ];
        const placeholders = [...route.matchAll(/\{([^}]+)\}/g)].map(
          (match) => match[1],
        );
        expect(
          params
            .filter((p: any) => p.in === 'path')
            .map((p: any) => p.name)
            .sort(),
        ).toEqual(placeholders.sort());
      }
    }
    expect(documented.sort()).toEqual(actual.sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[A-Za-z][A-Za-z0-9]+$/.test(id))).toBe(true);
  });

  it('keeps binary transfer distinct from JSON operations', () => {
    for (const route of ['/api/tasks/{slug}/files', '/api/logs/{id}/files']) {
      const upload = document.paths[route].post;
      expect(Object.keys(upload.requestBody.content)).toEqual([
        'application/octet-stream',
      ]);
      expect(
        upload.parameters.find((p: any) => p.name === 'Content-Length')
          .required,
      ).toBe(true);
    }
    for (const route of [
      '/api/tasks/{slug}/files/{id}',
      '/api/logs/{id}/files/{attachmentId}',
    ]) {
      expect(
        Object.keys(document.paths[route].get.responses['200'].content),
      ).toEqual(['*/*']);
    }
    expect(
      document.components.schemas.CreateTaskLog.properties,
    ).not.toHaveProperty('logged_by');
    expect(document.components.schemas.UpdateLog.properties).not.toHaveProperty(
      'consume_stock',
    );
  });
});

describe('OpenAPI matches handler responses', () => {
  let app: express.Express;
  let db: ReturnType<typeof openDatabase>;
  let dir: string;
  let services: Services | null;
  const visited = new Set<string>();

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maintenance-openapi-'));
    db = openDatabase(':memory:');
    services = {
      service: new MaintenanceService(db, {
        getRuntime: () => 50,
        config: { runtimeNotifyLeadHours: 10, timeNotifyLeadDays: 7 },
        fileStore: new FileStore(dir),
        // No stowage client, notifications or physical hardware in these tests.
      }),
      runtime: {
        subscribedPaths: [],
        lastUpdateAt: null,
      } as unknown as Services['runtime'],
      version: 'test',
    };
    app = express();
    const router = express.Router();
    router.use((req, _res, next) => {
      (req as any).skPrincipal = { identifier: 'synthetic-user' };
      next();
    });
    mountApi(router, () => services);
    app.use(router);
    visited.clear();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function call(
    method: 'get' | 'post' | 'put' | 'delete',
    route: string,
    url = route,
    body?: object,
    expectedStatus = method === 'post' ? 201 : method === 'delete' ? 204 : 200,
  ) {
    const operation = document.paths[route][method];
    if (body)
      valid(operation.requestBody.content['application/json'].schema, body);
    let pending = request(app)[method](url);
    if (body) pending = pending.send(body);
    const response = await pending;
    expect(response.status, response.text).toBe(expectedStatus);
    const schema =
      operation.responses[String(expectedStatus)]?.content?.['application/json']
        ?.schema;
    if (expectedStatus !== 204) {
      expect(schema).toBeDefined();
      valid(schema, response.body);
    } else expect(response.text).toBe('');
    visited.add(operation.operationId);
    return response.body;
  }

  it('validates successful responses for all 22 operations with synthetic data', async () => {
    await call('get', '/api/tasks');
    await call('get', '/api/stats');
    await call('get', '/api/health');
    await call('post', '/api/tasks', undefined, {
      name: 'Oil',
      runtime_interval: 100,
      runtime_path: 'propulsion.test.runTime',
      last_runtime: 0,
      tags: ['engine'],
      estimated_hours: 0,
    });
    await call('post', '/api/tasks', undefined, {
      name: 'Todo',
      due_date: '2026-11-10',
    });
    await call('get', '/api/tasks/{slug}', '/api/tasks/oil');
    await call('put', '/api/tasks/{slug}', '/api/tasks/oil', {
      description: 'Synthetic',
      runtime_warning_hours: 0,
      estimated_cost: null,
    });
    const completed = await call(
      'post',
      '/api/tasks/{slug}/logs',
      '/api/tasks/todo/logs',
      { maintenance_date: '2026-11-10', consume_stock: false, actual_cost: 0 },
    );
    expect(completed.logged_by).toBe('synthetic-user');
    const todo = await call('get', '/api/tasks/{slug}', '/api/tasks/todo');
    expect(todo.is_archived).toBe(true);
    expect(todo.due_date).toBeNull();
    await call('post', '/api/logs', undefined, {
      title: 'Standalone',
      maintenance_date: '2026-11-09',
      actual_hours: 1.5,
    });
    await call('get', '/api/tasks/{slug}/logs', '/api/tasks/todo/logs');
    await call(
      'get',
      '/api/logs',
      '/api/logs?pageSize=1&sort=maintenance_date&order=desc',
    );
    await call('get', '/api/tags');
    await call('get', '/api/stats');
    await call(
      'get',
      '/api/tasks',
      '/api/tasks?tags=engine&status=pending,ok&pageSize=1',
    );
    await call('put', '/api/logs/{id}', `/api/logs/${completed.id}`, {
      notes: 'Edited',
      actual_cost: null,
    });

    for (const [collection, url, detail] of [
      [
        '/api/tasks/{slug}/files',
        '/api/tasks/oil/files',
        '/api/tasks/{slug}/files/{id}',
      ],
      [
        '/api/logs/{id}/files',
        `/api/logs/${completed.id}/files`,
        '/api/logs/{id}/files/{attachmentId}',
      ],
    ]) {
      const uploaded = await request(app)
        .post(url)
        .set('Content-Type', 'application/octet-stream')
        .set('X-File-Name', 'synthetic.txt')
        .set('X-File-Type', 'text/plain')
        .send(Buffer.from('fixture'));
      expect(uploaded.status).toBe(201);
      valid(
        document.paths[collection].post.responses['201'].content[
          'application/json'
        ].schema,
        uploaded.body,
      );
      visited.add(document.paths[collection].post.operationId);
      await call('get', collection, url);
      const download = await request(app).get(`${url}/${uploaded.body.id}`);
      expect(download.status).toBe(200);
      expect(download.text).toBe('fixture');
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      visited.add(document.paths[detail].get.operationId);
      await call('delete', detail, `${url}/${uploaded.body.id}`);
    }
    await call('delete', '/api/logs/{id}', `/api/logs/${completed.id}`);
    await call('delete', '/api/tasks/{slug}', '/api/tasks/oil');
    expect(visited.size).toBe(22);
  });

  it('documents validation, missing-resource, conflict and unavailable errors', async () => {
    const missing = await request(app).post('/api/tasks').send({});
    expect(missing.status).toBe(400);
    valid(
      document.paths['/api/tasks'].post.responses['400'].content[
        'application/json'
      ].schema,
      missing.body,
    );
    expect(ajv.validate(document.components.schemas.CreateTask, {})).toBe(
      false,
    );
    expect(ajv.validate(document.components.schemas.CreateTaskLog, {})).toBe(
      false,
    );
    await call(
      'get',
      '/api/tasks/{slug}',
      '/api/tasks/missing',
      undefined,
      404,
    );
    await call('post', '/api/tasks', undefined, {
      name: 'Unique',
      slug: 'unique',
    });
    await call(
      'post',
      '/api/tasks',
      undefined,
      { name: 'Duplicate', slug: 'unique' },
      409,
    );
    services = null;
    await call('get', '/api/health', undefined, undefined, 503);
  });
});
