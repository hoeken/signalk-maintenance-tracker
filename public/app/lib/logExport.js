/**
 * Log export helpers (§7.4): build CSV / Markdown / JSON from log entries and
 * trigger a browser download. Shared by the master log and per-task logs.
 */

/** @typedef {import('../types.js').LogDTO} LogDTO */

/** Selectable output formats, in display order. */
export const EXPORT_FORMATS = [
  { value: 'csv', label: 'CSV', ext: 'csv', mime: 'text/csv' },
  { value: 'markdown', label: 'Markdown', ext: 'md', mime: 'text/markdown' },
  { value: 'json', label: 'JSON', ext: 'json', mime: 'application/json' },
];

const HEADERS = ['Task', 'Date', 'Runtime Hours', 'Logged By', 'Notes'];

/** @param {LogDTO} e @returns {(string|number|null)[]} */
function row(e) {
  return [
    e.task_name,
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

/** @param {LogDTO[]} entries */
export function buildCsv(entries) {
  const rows = [HEADERS];
  for (const e of entries) rows.push(row(e).map(csvField));
  return rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
}

/** Markdown-table cells can't contain a raw `|` or newline. */
function mdCell(/** @type {string|number|null|undefined} */ value) {
  const s = value === null || value === undefined ? '' : String(value);
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/** @param {LogDTO[]} entries */
export function buildMarkdown(entries) {
  const lines = [
    '# SignalK Maintenance Log',
    '',
    '| ' + HEADERS.join(' | ') + ' |',
    '| ' + HEADERS.map(() => '---').join(' | ') + ' |',
  ];
  for (const e of entries) {
    lines.push('| ' + row(e).map(mdCell).join(' | ') + ' |');
  }
  return lines.join('\n') + '\n';
}

/** @param {LogDTO[]} entries */
export function buildJson(entries) {
  const records = entries.map((e) => ({
    task: e.task_name,
    task_slug: e.task_slug,
    maintenance_date: e.maintenance_date,
    runtime_hours: e.runtime_hours,
    logged_by: e.logged_by,
    notes: e.notes,
  }));
  return JSON.stringify(records, null, 2) + '\n';
}

/**
 * @param {LogDTO[]} entries
 * @param {string} format one of EXPORT_FORMATS' `value`s
 */
export function buildLogExport(entries, format) {
  if (format === 'markdown') return buildMarkdown(entries);
  if (format === 'json') return buildJson(entries);
  return buildCsv(entries);
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
 * @param {string} content
 * @param {string} filename
 * @param {string} mime
 */
export function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
