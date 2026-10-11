import express from 'express';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { FileStore, MAX_FILE_BYTES } from '../files/store';
import { MaintenanceService } from '../service';
import { mountApi, Services } from './router';

/**
 * Task attachments (§8.6): raw-body upload, listing, download, delete, and
 * the on-disk lifecycle under the plugin data directory.
 */

const base = '/plugins/signalk-maintenance-tracker/api';

let app: express.Express;
let root: string;
let service: MaintenanceService;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-files-'));
  const db = openDatabase(':memory:');
  service = new MaintenanceService(db, {
    getRuntime: () => null,
    config: { runtimeNotifyLeadHours: 10, timeNotifyLeadDays: 7 },
    fileStore: new FileStore(path.join(root, 'files')),
  });
  const services: Services = {
    service,
    runtime: {
      subscribedPaths: [],
      lastUpdateAt: null,
    } as unknown as Services['runtime'],
    version: '0.1.0-test',
  };
  app = express();
  const router = express.Router();
  mountApi(router, () => services);
  app.use('/plugins/signalk-maintenance-tracker', router);
  await request(app).post(`${base}/tasks`).send({ name: 'Engine oil change' });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function upload(
  slug: string,
  name: string,
  body: Buffer | string,
  mime?: string,
) {
  return request(app)
    .post(`${base}/tasks/${slug}/files`)
    .set('Content-Type', 'application/octet-stream')
    .set('X-File-Name', encodeURIComponent(name))
    .set('X-File-Type', mime ?? 'text/plain')
    .send(body);
}

/** Every regular file under the store root (temp dir included). */
function filesOnDisk(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(path.join(root, 'files'));
  return out;
}

describe('task file endpoints', () => {
  it('uploads a raw body, lists it on the task, and serves it back', async () => {
    const res = await upload(
      'engine-oil-change',
      'Manual — Yanmar 3YM30.pdf',
      Buffer.from('%PDF-1.4 hello'),
      'application/pdf',
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Manual — Yanmar 3YM30.pdf',
      size: 14,
      mime: 'application/pdf',
    });
    expect(typeof res.body.id).toBe('number');

    const list = await request(app).get(
      `${base}/tasks/engine-oil-change/files`,
    );
    expect(list.body.data).toEqual([res.body]);
    // and on the task itself, alongside tags and consumables
    const task = await request(app).get(`${base}/tasks/engine-oil-change`);
    expect(task.body.files).toEqual([res.body]);

    const dl = await request(app)
      .get(`${base}/tasks/engine-oil-change/files/${res.body.id}`)
      .buffer()
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment;/);
    expect(dl.headers['content-disposition']).toContain('Yanmar');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect((dl.body as Buffer).toString()).toBe('%PDF-1.4 hello');

    // stored under the task's own directory, temp dir left clean
    const onDisk = filesOnDisk();
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0]).toContain(path.join('files', '1'));
    expect(onDisk[0]).toMatch(/Manual_Yanmar_3YM30\.pdf$/);
  });

  it('accepts any content type and keeps the uploader name out of the path', async () => {
    const res = await request(app)
      .post(`${base}/tasks/engine-oil-change/files`)
      .set('Content-Type', 'image/jpeg')
      .set('X-File-Name', encodeURIComponent('../../etc/passwd'))
      .send(Buffer.from([0xff, 0xd8, 0xff]));
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('passwd');
    expect(res.body.mime).toBeNull();
    const onDisk = filesOnDisk();
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0].startsWith(path.join(root, 'files', '1'))).toBe(true);
  });

  it('deletes a file from the index and from disk', async () => {
    const res = await upload('engine-oil-change', 'receipt.txt', 'paid');
    expect(filesOnDisk()).toHaveLength(1);

    const del = await request(app).delete(
      `${base}/tasks/engine-oil-change/files/${res.body.id}`,
    );
    expect(del.status).toBe(204);
    expect(filesOnDisk()).toHaveLength(0);
    const list = await request(app).get(
      `${base}/tasks/engine-oil-change/files`,
    );
    expect(list.body.data).toEqual([]);
    const gone = await request(app).get(
      `${base}/tasks/engine-oil-change/files/${res.body.id}`,
    );
    expect(gone.status).toBe(404);
  });

  it('only reaches a file through its own task', async () => {
    await request(app).post(`${base}/tasks`).send({ name: 'Zincs' });
    const res = await upload('engine-oil-change', 'a.txt', 'a');
    const other = await request(app).get(
      `${base}/tasks/zincs/files/${res.body.id}`,
    );
    expect(other.status).toBe(404);
    const otherDel = await request(app).delete(
      `${base}/tasks/zincs/files/${res.body.id}`,
    );
    expect(otherDel.status).toBe(404);
    expect(filesOnDisk()).toHaveLength(1);
  });

  it('removes the files with the task', async () => {
    await upload('engine-oil-change', 'a.txt', 'a');
    await upload('engine-oil-change', 'b.txt', 'b');
    expect(filesOnDisk()).toHaveLength(2);
    const del = await request(app).delete(`${base}/tasks/engine-oil-change`);
    expect(del.status).toBe(204);
    expect(filesOnDisk()).toHaveLength(0);
    expect(fs.existsSync(path.join(root, 'files', '1'))).toBe(false);
  });

  it('refuses an upload declared larger than the limit before reading it', async () => {
    const res = await request(app)
      .post(`${base}/tasks/engine-oil-change/files`)
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', 'huge.bin')
      .set('Content-Length', String(MAX_FILE_BYTES + 1))
      .send(Buffer.alloc(16));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('file_too_large');
    expect(filesOnDisk()).toHaveLength(0);
  });

  it('cleans up a stream that overruns the limit', async () => {
    const store = new FileStore(path.join(root, 'files'));
    const { Readable } = await import('node:stream');
    const source = Readable.from([Buffer.alloc(600), Buffer.alloc(600)]);
    await expect(store.writeTemp(source, 1000)).rejects.toMatchObject({
      maxBytes: 1000,
    });
    expect(filesOnDisk()).toHaveLength(0);
  });

  it('validates the upload request', async () => {
    const noName = await request(app)
      .post(`${base}/tasks/engine-oil-change/files`)
      .set('Content-Type', 'application/octet-stream')
      .send('x');
    expect(noName.status).toBe(400);
    expect(noName.body.error.code).toBe('invalid_file');

    const asJson = await request(app)
      .post(`${base}/tasks/engine-oil-change/files`)
      .set('X-File-Name', 'notes.json')
      .send({ not: 'a file' });
    expect(asJson.status).toBe(400);
    expect(asJson.body.error.code).toBe('invalid_upload');

    const noTask = await upload('nope', 'a.txt', 'a');
    expect(noTask.status).toBe(404);

    const badId = await request(app).get(
      `${base}/tasks/engine-oil-change/files/abc`,
    );
    expect(badId.status).toBe(400);
    expect(filesOnDisk()).toHaveLength(0);
  });

  it('answers 503 for uploads when no file store is configured', async () => {
    const db = openDatabase(':memory:');
    const bare = new MaintenanceService(db, {
      getRuntime: () => null,
      config: { runtimeNotifyLeadHours: 10, timeNotifyLeadDays: 7 },
    });
    bare.createTask({ name: 'X' });
    const { Readable } = await import('node:stream');
    await expect(
      bare.addFile(
        'x',
        { name: 'a.txt', mime: null, declaredSize: 1 },
        Readable.from(['a']),
      ),
    ).rejects.toMatchObject({ status: 503, code: 'files_unavailable' });
    // listing still works — just empty
    expect(bare.getTask('x').files).toEqual([]);
  });
});
