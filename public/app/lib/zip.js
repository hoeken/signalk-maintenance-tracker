/**
 * Minimal zip writer for the log export (§7.4). Entries are stored, not
 * compressed — attachments are mostly photos and PDFs that don't shrink, and
 * it keeps this small enough to hand-roll rather than vendor a library.
 * Names are written as UTF-8 (general-purpose flag bit 11). No Zip64, so the
 * archive is capped at 4 GiB and 65535 entries.
 */

/** @type {Uint32Array|null} */
let crcTable = null;

/** @param {Uint8Array} data */
export function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time words for a local Date (2-second resolution). */
function dosDateTime(/** @type {Date} */ d) {
  const year = Math.max(d.getFullYear(), 1980);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const MAX_U32 = 0xffffffff;

/**
 * Build a zip archive.
 * @param {{ path: string, data: Uint8Array<ArrayBuffer> }[]} files paths use `/`
 * @param {Date} [now] modification time stamped on every entry
 * @returns {Blob}
 */
export function buildZip(files, now = new Date()) {
  if (files.length > 0xffff) throw new Error('Too many files for a zip');
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(now);
  /** @type {BlobPart[]} */
  const parts = [];
  /** @type {Uint8Array<ArrayBuffer>[]} */
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.path);
    const crc = crc32(f.data);
    const size = f.data.length;
    if (offset + 30 + name.length + size > MAX_U32)
      throw new Error('Download is too large for a zip (over 4 GB)');

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed (2.0)
    lv.setUint16(6, 0x0800, true); // flags: UTF-8 names
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // extra field length
    local.set(name, 30);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    // extra/comment length, disk start, internal/external attrs: all zero
    cv.setUint32(42, offset, true); // local header offset
    cd.set(name, 46);

    parts.push(local, f.data);
    central.push(cd);
    offset += local.length + size;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  if (offset + cdSize + 22 > MAX_U32)
    throw new Error('Download is too large for a zip (over 4 GB)');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory signature
  ev.setUint16(8, files.length, true); // entries on this disk
  ev.setUint16(10, files.length, true); // entries total
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true); // central directory offset

  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
