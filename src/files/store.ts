import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Readable } from 'node:stream';

/** Largest single upload accepted: 1 GiB. */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;

/** Thrown by write() when the stream runs past `maxBytes`. */
export class FileTooLargeError extends Error {
  constructor(public maxBytes: number) {
    super(`File exceeds the ${maxBytes} byte limit`);
  }
}

/**
 * On-disk home for task attachments: `<root>/<task_id>/<token>-<name>`, with
 * `<root>` under the plugin data directory. The database row (FilesRepo)
 * holds the path relative to `<root>`, so the data directory can move as a
 * whole. Uploads stream into `<root>/tmp` and are renamed into place only
 * once fully written, so a crash or an over-limit upload never leaves a
 * half-file where a task would find it.
 */
export class FileStore {
  constructor(readonly root: string) {}

  absolute(relPath: string): string {
    return path.join(this.root, relPath);
  }

  /**
   * Stream an upload to a temp file, enforcing `maxBytes`. Resolves with the
   * temp path and byte count; rejects (temp removed) on error or overflow.
   */
  writeTemp(
    source: Readable,
    maxBytes: number,
  ): Promise<{ tmpPath: string; size: number }> {
    const tmpDir = path.join(this.root, 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, crypto.randomBytes(12).toString('hex'));
    return new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tmpPath, { flags: 'wx' });
      let size = 0;
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        source.unpipe(out);
        out.destroy();
        fs.rm(tmpPath, { force: true }, () => reject(err));
      };
      source.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) fail(new FileTooLargeError(maxBytes));
      });
      source.on('error', fail);
      // An IncomingMessage cut off mid-body closes with complete === false
      // (a plain Readable has no such flag and simply ends).
      source.on('close', () => {
        if ((source as { complete?: boolean }).complete === false)
          fail(new Error('Upload aborted'));
      });
      out.on('error', fail);
      out.on('finish', () => {
        if (settled) return;
        settled = true;
        resolve({ tmpPath, size });
      });
      source.pipe(out);
    });
  }

  /** Move a finished temp file under its task; returns the relative path. */
  commit(tmpPath: string, taskId: number, name: string): string {
    const token = crypto.randomBytes(4).toString('hex');
    const relPath = path.join(String(taskId), `${token}-${safeName(name)}`);
    const dest = this.absolute(relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(tmpPath, dest);
    return relPath;
  }

  discard(tmpPath: string): void {
    fs.rmSync(tmpPath, { force: true });
  }

  remove(relPath: string): void {
    fs.rmSync(this.absolute(relPath), { force: true });
  }

  /** Drop a task's whole directory (task deleted). */
  removeTask(taskId: number): void {
    fs.rmSync(path.join(this.root, String(taskId)), {
      recursive: true,
      force: true,
    });
  }
}

/**
 * The on-disk name only exists for someone browsing the data directory; the
 * real name lives in the database. Anything that isn't a plain filename
 * character is squashed so path separators, control characters and the like
 * can't influence where the file lands.
 */
function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '');
  return (cleaned || 'file').slice(0, 100);
}
