import { describe, it, expect } from 'vitest';
import { buildZip, crc32 } from '../../public/app/lib/zip.js';
import { readZip } from './helpers.js';

const enc = new TextEncoder();

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(enc.encode(''))).toBe(0);
    expect(crc32(enc.encode('hello'))).toBe(0x3610a686);
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });

  it('stores files that read back byte-for-byte, with UTF-8 names', async () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254]);
    const zip = buildZip([
      { path: 'log/log.csv', data: enc.encode('a,b\r\n') },
      { path: 'log/attachments/2026-01-02_log-1/räksmörgås.bin', data: bytes },
      { path: 'log/empty.txt', data: new Uint8Array(0) },
    ]);
    expect(zip.type).toBe('application/zip');
    const files = await readZip(zip);
    expect([...files.keys()]).toEqual([
      'log/log.csv',
      'log/attachments/2026-01-02_log-1/räksmörgås.bin',
      'log/empty.txt',
    ]);
    const bin = files.get('log/attachments/2026-01-02_log-1/räksmörgås.bin');
    expect([...bin.data]).toEqual([...bytes]);
    expect(bin.crc).toBe(crc32(bytes));
    expect(bin.flags & 0x0800).toBe(0x0800);
    expect(new TextDecoder().decode(files.get('log/log.csv').data)).toBe(
      'a,b\r\n',
    );
    expect(files.get('log/empty.txt').data.length).toBe(0);
  });

  it('builds a valid empty archive', async () => {
    const files = await readZip(buildZip([]));
    expect(files.size).toBe(0);
  });
});
