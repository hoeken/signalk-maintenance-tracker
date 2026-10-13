import express from 'express';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { FileStore } from '../files/store';
import { MaintenanceService } from '../service';
import { mountApi, Services } from './router';

/**
 * Log-entry attachments (§8.6): the task-file protocol hung off a log entry
 * — upload, listing on the entry, download, delete — and the bytes'
 * lifecycle alongside the entry and its task.
 */

const base = '/plugins/signalk-maintenance-tracker/api';

let app: express.Express;
let root: string;
let service: MaintenanceService;
/** id of the task-linked entry created in beforeEach */
let logId: number;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-logfiles-'));
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
  const log = await request(app)
    .post(`${base}/tasks/engine-oil-change/logs`)
    .send({ maintenance_date: '2026-07-01T00:00:00Z', notes: 'Done.' });
  logId = log.body.id;
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function upload(
  id: number,
  name: string,
  body: Buffer | string,
  mime?: string,
) {
  return request(app)
    .post(`${base}/logs/${id}/files`)
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

describe('log file endpoints', () => {
  it('a fresh entry carries an empty files list', async () => {
    const logs = await request(app).get(`${base}/tasks/engine-oil-change/logs`);
    expect(logs.body.data[0].files).toEqual([]);
    const master = await request(app).get(`${base}/logs`);
    expect(master.body.data[0].files).toEqual([]);
  });

  it('uploads a raw body, lists it on the entry everywhere, and serves it back', async () => {
    const res = await upload(
      logId,
      'Impeller — after.jpg',
      Buffer.from([0xff, 0xd8, 0xff]),
      'image/jpeg',
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Impeller — after.jpg',
      size: 3,
      mime: 'image/jpeg',
    });

    const list = await request(app).get(`${base}/logs/${logId}/files`);
    expect(list.body.data).toEqual([res.body]);
    // the entry carries its files in the task log and the master log alike
    const logs = await request(app).get(`${base}/tasks/engine-oil-change/logs`);
    expect(logs.body.data[0].files).toEqual([res.body]);
    const master = await request(app).get(`${base}/logs`);
    expect(master.body.data[0].files).toEqual([res.body]);
    // and an edit returns them too
    const edited = await request(app)
      .put(`${base}/logs/${logId}`)
      .send({ notes: 'Done, photo attached.' });
    expect(edited.body.files).toEqual([res.body]);

    const dl = await request(app).get(
      `${base}/logs/${logId}/files/${res.body.id}`,
    );
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('image/jpeg');
    expect(dl.headers['content-disposition']).toMatch(/^inline;/);
    expect(dl.headers['x-content-type-options']).toBe('nosniff');

    // under the entry's own directory, apart from any task's
    const onDisk = filesOnDisk();
    expect(onDisk).toHaveLength(1);
    expect(
      onDisk[0].startsWith(path.join(root, 'files', 'logs', String(logId))),
    ).toBe(true);
    expect(onDisk[0]).toMatch(/Impeller_after\.jpg$/);
  });

  it('serves what the browser cannot show as an attachment', async () => {
    const res = await upload(
      logId,
      'invoice.docx',
      'x',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const dl = await request(app).get(
      `${base}/logs/${logId}/files/${res.body.id}`,
    );
    expect(dl.headers['content-disposition']).toMatch(/^attachment;/);
    expect(dl.headers['content-disposition']).toContain('invoice.docx');
  });

  it('attaches to a standalone entry just the same', async () => {
    const standalone = await request(app)
      .post(`${base}/logs`)
      .send({ title: 'Haul out', maintenance_date: '2026-07-02T00:00:00Z' });
    const res = await upload(standalone.body.id, 'yard-bill.txt', 'paid');
    expect(res.status).toBe(201);
    const master = await request(app).get(`${base}/logs`);
    const entry = master.body.data.find(
      (e: { id: number }) => e.id === standalone.body.id,
    );
    expect(entry.files).toEqual([res.body]);
  });

  it('deletes a file from the index and from disk', async () => {
    const res = await upload(logId, 'receipt.txt', 'paid');
    expect(filesOnDisk()).toHaveLength(1);

    const del = await request(app).delete(
      `${base}/logs/${logId}/files/${res.body.id}`,
    );
    expect(del.status).toBe(204);
    expect(filesOnDisk()).toHaveLength(0);
    const list = await request(app).get(`${base}/logs/${logId}/files`);
    expect(list.body.data).toEqual([]);
    const gone = await request(app).get(
      `${base}/logs/${logId}/files/${res.body.id}`,
    );
    expect(gone.status).toBe(404);
  });

  it('only reaches a file through its own entry', async () => {
    const other = await request(app)
      .post(`${base}/logs`)
      .send({ title: 'Other', maintenance_date: '2026-07-02T00:00:00Z' });
    const res = await upload(logId, 'a.txt', 'a');
    const get = await request(app).get(
      `${base}/logs/${other.body.id}/files/${res.body.id}`,
    );
    expect(get.status).toBe(404);
    const del = await request(app).delete(
      `${base}/logs/${other.body.id}/files/${res.body.id}`,
    );
    expect(del.status).toBe(404);
    expect(filesOnDisk()).toHaveLength(1);
    // and a task file id doesn't answer under a log entry
    await request(app)
      .post(`${base}/tasks/engine-oil-change/files`)
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', 'manual.txt')
      .send('m');
    const crossed = await request(app).get(`${base}/logs/${logId}/files/2`);
    expect(crossed.status).toBe(404);
  });

  it('404s for an entry that does not exist', async () => {
    const res = await upload(999, 'a.txt', 'a');
    expect(res.status).toBe(404);
    expect(filesOnDisk()).toHaveLength(0);
    const list = await request(app).get(`${base}/logs/999/files`);
    expect(list.status).toBe(404);
  });

  it('removes the files with the entry', async () => {
    await upload(logId, 'a.txt', 'a');
    await upload(logId, 'b.txt', 'b');
    expect(filesOnDisk()).toHaveLength(2);
    const del = await request(app).delete(`${base}/logs/${logId}`);
    expect(del.status).toBe(204);
    expect(filesOnDisk()).toHaveLength(0);
    expect(fs.existsSync(path.join(root, 'files', 'logs', String(logId)))).toBe(
      false,
    );
  });

  it('removes the entries’ files with the task, and leaves other entries alone', async () => {
    await upload(logId, 'a.txt', 'a');
    const standalone = await request(app)
      .post(`${base}/logs`)
      .send({ title: 'Haul out', maintenance_date: '2026-07-02T00:00:00Z' });
    await upload(standalone.body.id, 'keep.txt', 'k');
    await request(app)
      .post(`${base}/tasks/engine-oil-change/files`)
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', 'manual.txt')
      .send('m');
    expect(filesOnDisk()).toHaveLength(3);

    const del = await request(app).delete(`${base}/tasks/engine-oil-change`);
    expect(del.status).toBe(204);
    const left = filesOnDisk();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatch(/keep\.txt$/);
    expect(service.logFiles.forLog(logId)).toEqual([]);
  });

  it('rejects a JSON body: nothing to stream', async () => {
    const res = await request(app)
      .post(`${base}/logs/${logId}/files`)
      .set('X-File-Name', 'a.json')
      .send({ not: 'bytes' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_upload');
    expect(filesOnDisk()).toHaveLength(0);
  });
});
