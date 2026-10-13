/**
 * Log export helpers (§7.4): build CSV / Markdown / JSON from log entries and
 * trigger a browser download. Shared by the master log and per-task logs.
 *
 * With attachments, the log goes into a zip alongside each entry's files,
 * stored at `attachments/<task>_<date>_log-<id>/<name>`, where <task> is the
 * slugified task name (or a standalone entry's title). The log gains an
 * Attachments column listing those exact paths, so every file is tied to its
 * entry by the log itself, not just by folder naming.
 */

import { slugify } from './slug.js';

/** @typedef {import('../types.js').LogDTO} LogDTO */
/** Zip paths of each entry's attachments, by log id, in `files` order. @typedef {Map<number, string[]>} AttachmentPaths */

/** Selectable output formats, in display order. */
export const EXPORT_FORMATS = [
  { value: 'csv', label: 'CSV', ext: 'csv', mime: 'text/csv' },
  { value: 'markdown', label: 'Markdown', ext: 'md', mime: 'text/markdown' },
  { value: 'json', label: 'JSON', ext: 'json', mime: 'application/json' },
];

const HEADERS = ['Task', 'Date', 'Runtime Hours', 'Logged By', 'Notes'];

/**
 * A filename safe to use as one zip path segment on any OS: no separators,
 * control or Windows-reserved characters, no trailing dots/spaces.
 * @param {string} name
 */
export function safeFileName(name) {
  const s = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/, '')
    .trim();
  return s === '' || /^\.+$/.test(s) ? 'file' : s;
}

/**
 * Where each entry's attachments go in the zip: one folder per entry, named
 * task, date and log id. Names that collide within an
 * entry (case-insensitively, for Windows/macOS) get a ` (2)`, ` (3)`… suffix
 * before the extension.
 * @param {LogDTO[]} entries
 * @returns {AttachmentPaths}
 */
export function attachmentPaths(entries) {
  /** @type {AttachmentPaths} */
  const out = new Map();
  for (const e of entries) {
    const files = e.files || [];
    if (files.length === 0) continue;
    // capped so deep paths stay under Windows' 260-character limit
    const name = slugify(e.task_name ?? e.title ?? '')
      .slice(0, 60)
      .replace(/-+$/, '');
    const dir =
      'attachments/' +
      name +
      '_' +
      // a calendar day stored at UTC midnight: the date part is the day
      e.maintenance_date.slice(0, 10) +
      '_log-' +
      e.id +
      '/';
    const taken = new Set();
    out.set(
      e.id,
      files.map((f) => {
        const base = safeFileName(f.name);
        const dot = base.lastIndexOf('.');
        const stem = dot > 0 ? base.slice(0, dot) : base;
        const ext = dot > 0 ? base.slice(dot) : '';
        let name = base;
        for (let n = 2; taken.has(name.toLowerCase()); n++)
          name = stem + ' (' + n + ')' + ext;
        taken.add(name.toLowerCase());
        return dir + name;
      }),
    );
  }
  return out;
}

/** @param {LogDTO} e @returns {(string|number|null|undefined)[]} */
function row(e) {
  return [
    // standalone (non-task) entries carry a title in place of a task name
    e.task_name ?? e.title,
    e.maintenance_date,
    e.runtime_hours,
    e.logged_by,
    e.notes,
  ];
}

/** @param {string|number|null|undefined} value */
function csvField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** @param {AttachmentPaths} [paths] */
function headers(paths) {
  return paths ? [...HEADERS, 'Attachments'] : HEADERS;
}

/**
 * @param {LogDTO} e
 * @param {AttachmentPaths} [paths]
 * @param {(paths: string[]) => string} [join]
 */
function cells(e, paths, join = (p) => p.join('\n')) {
  const r = row(e);
  if (paths) r.push(join(paths.get(e.id) || []));
  return r;
}

/** @param {LogDTO[]} entries @param {AttachmentPaths} [paths] */
export function buildCsv(entries, paths) {
  const rows = [headers(paths)];
  for (const e of entries) rows.push(cells(e, paths).map(csvField));
  return rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
}

/** Markdown-table cells can't contain a raw `|` or newline. */
function mdCell(/** @type {string|number|null|undefined} */ value) {
  const s = value === null || value === undefined ? '' : String(value);
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/**
 * Markdown link to a zip path; `<…>` lets the target contain spaces (paths
 * never contain `<>`, safeFileName strips them).
 */
function mdLink(/** @type {string} */ path) {
  const label = path.slice(path.lastIndexOf('/') + 1).replace(/[[\]]/g, '\\$&');
  return '[' + label + '](<' + path + '>)';
}

/** @param {LogDTO[]} entries @param {AttachmentPaths} [paths] */
export function buildMarkdown(entries, paths) {
  const cols = headers(paths);
  const lines = [
    '# SignalK Maintenance Log',
    '',
    '| ' + cols.join(' | ') + ' |',
    '| ' + cols.map(() => '---').join(' | ') + ' |',
  ];
  for (const e of entries) {
    const r = cells(e, paths, (p) => p.map(mdLink).join('<br>'));
    lines.push('| ' + r.map(mdCell).join(' | ') + ' |');
  }
  return lines.join('\n') + '\n';
}

/** @param {LogDTO[]} entries @param {AttachmentPaths} [paths] */
export function buildJson(entries, paths) {
  const records = entries.map((e) => ({
    task: e.task_name ?? e.title,
    task_slug: e.task_slug,
    maintenance_date: e.maintenance_date,
    runtime_hours: e.runtime_hours,
    logged_by: e.logged_by,
    notes: e.notes,
    ...(paths ? { attachments: paths.get(e.id) || [] } : {}),
  }));
  return JSON.stringify(records, null, 2) + '\n';
}

/**
 * @param {LogDTO[]} entries
 * @param {string} format one of EXPORT_FORMATS' `value`s
 * @param {AttachmentPaths} [paths] adds an Attachments column when given
 */
export function buildLogExport(entries, format, paths) {
  if (format === 'markdown') return buildMarkdown(entries, paths);
  if (format === 'json') return buildJson(entries, paths);
  return buildCsv(entries, paths);
}

/** `YYYY-MM-DD` in local time, for download filenames. @param {Date} [now] */
export function dateStamp(now = new Date()) {
  /** @param {number} n */
  const pad = (n) => String(n).padStart(2, '0');
  return (
    now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
  );
}

/**
 * @param {string|Blob} content
 * @param {string} filename
 * @param {string} [mime] for string content
 */
export function triggerDownload(content, filename, mime) {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
