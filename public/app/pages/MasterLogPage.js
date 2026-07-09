/**
 * Master log (§7.4): one row per log entry across all tasks. Server-side
 * search/sort/pagination, truncated-but-expandable notes.
 */
import { html } from '../lib/html.js';
import { useState, useEffect } from '../../vendor/preact-hooks.js';
import { useLogs } from '../api/hooks.js';
import { apiFetch, buildQuery } from '../api/client.js';
import { useListParams } from '../lib/useListParams.js';
import { formatDate, formatHours, truncate } from '../lib/format.js';
import { Table } from '../components/Table.js';
import { Pagination } from '../components/Pagination.js';
import { MarkdownView } from '../components/MarkdownView.js';

/** @typedef {import('../types.js').LogDTO} LogDTO */

const PAGE_SIZE = 25;
const NOTE_PREVIEW_CHARS = 120;
/** Server-side pageSize cap (see MAX_PAGE_SIZE in src/service.ts). */
const EXPORT_PAGE_SIZE = 200;

/** @param {string|number|null|undefined} value */
function csvField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** @param {LogDTO[]} entries */
function buildCsv(entries) {
  const rows = [['Task', 'Date', 'Runtime Hours', 'Logged By', 'Notes']];
  for (const e of entries) {
    rows.push([
      csvField(e.task_name),
      csvField(e.maintenance_date),
      csvField(e.runtime_hours),
      csvField(e.logged_by),
      csvField(e.notes),
    ]);
  }
  return rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
}

/** Fetch every log entry, paging past the server's pageSize cap. */
async function fetchAllLogs() {
  /** @type {LogDTO[]} */
  const entries = [];
  for (let page = 1; ; page += 1) {
    /** @type {import('../types.js').Page<LogDTO>} */
    const res = await apiFetch('/logs' + buildQuery({ page, pageSize: EXPORT_PAGE_SIZE }));
    entries.push(...res.data);
    if (res.data.length === 0 || entries.length >= res.total) break;
  }
  return entries;
}

export function MasterLogPage() {
  const { params, update } = useListParams();

  const page = parseInt(params.page || '1', 10) || 1;
  const search = params.search || '';
  const sort = params.sort || '';
  const order = params.order || '';

  const [searchText, setSearchText] = useState(search);
  useEffect(() => {
    setSearchText(search);
  }, [search]);
  useEffect(() => {
    if (searchText === search) return undefined;
    const timer = setTimeout(() => update({ search: searchText, page: undefined }), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const logsRes = useLogs({
    search: search || undefined,
    sort: sort || undefined,
    order: order || undefined,
    page: page,
    pageSize: PAGE_SIZE,
  });

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(/** @type {string|null} */(null));
  const downloadCsv = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const entries = await fetchAllLogs();
      const now = new Date();
      /** @param {number} n */
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      const blob = new Blob([buildCsv(entries)], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'signalk-maintenance-log-' + stamp + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const [expanded, setExpanded] = useState(/** @type {Record<string, boolean>} */({}));
  /** @param {number} id */
  const toggleExpanded = (id) => {
    /** @type {Record<string, boolean>} */
    const next = {};
    for (const key of Object.keys(expanded)) next[key] = expanded[key];
    next[id] = !next[id];
    setExpanded(next);
  };

  /** @param {string} key */
  const onSort = (key) => {
    if (sort === key) update({ order: order === 'asc' ? 'desc' : 'asc' });
    else update({ sort: key, order: key === 'maintenance_date' ? 'desc' : 'asc' });
  };

  /** @type {import('../components/Table.js').Column[]} */
  const columns = [
    {
      key: 'task',
      label: 'Task',
      sortable: true,
      render: (/** @type {LogDTO} */ e) =>
        html`<a href=${'#/tasks/' + encodeURIComponent(e.task_slug)}>${e.task_name}</a>`,
    },
    {
      key: 'maintenance_date',
      label: 'Date',
      sortable: true,
      className: 'num',
      render: (/** @type {LogDTO} */ e) => formatDate(e.maintenance_date),
    },
    {
      key: 'runtime_hours',
      label: 'Runtime',
      sortable: true,
      className: 'num',
      render: (/** @type {LogDTO} */ e) => formatHours(e.runtime_hours),
    },
    {
      key: 'logged_by',
      label: 'By',
      render: (/** @type {LogDTO} */ e) => e.logged_by || html`<span class="muted">—</span>`,
    },
  ];

  /** Notes render on their own full-width row under the entry. @param {LogDTO} e */
  const renderNotes = (e) => {
    if (!e.notes) return null;
    const isLong = e.notes.length > NOTE_PREVIEW_CHARS;
    const body = expanded[e.id] || !isLong
      ? html`
          <${MarkdownView} markdown=${e.notes} />
          ${isLong
            ? html`<button type="button" class="btn-link" onClick=${() => toggleExpanded(e.id)}>less</button>`
            : null}
        `
      : html`
          ${truncate(e.notes, NOTE_PREVIEW_CHARS)}${' '}
          <button type="button" class="btn-link" onClick=${() => toggleExpanded(e.id)}>more</button>
        `;
    return html`<div class="log-notes">
      <strong class="log-notes-label">Notes:</strong>
      <div class="log-notes-body">${body}</div>
    </div>`;
  };

  const pageData = logsRes.data;

  return html`
    <div>
      <div class="page-header">
        <h1 class="page-title">Maintenance Log</h1>
        <button type="button" class="btn btn-primary" disabled=${downloading} onClick=${downloadCsv}>
          <i class="bi bi-download" />${downloading ? 'Preparing…' : 'Download Log'}
        </button>
      </div>

      ${downloadError
      ? html`<div class="error-box">Failed to download log: ${downloadError}</div>`
      : null}

      <div class="toolbar">
        <div class="search-box">
          <i class="bi bi-search" />
          <input
            class="input"
            placeholder="Search log…"
            aria-label="Search log"
            value=${searchText}
            onInput=${(/** @type {any} */ e) => setSearchText(e.currentTarget.value)}
          />
        </div>
      </div>

      ${logsRes.error && !pageData
      ? html`<div class="error-box">Failed to load log: ${logsRes.error.message}</div>`
      : html`
            <${Table}
              columns=${columns}
              rows=${pageData ? pageData.data : []}
              renderDetail=${renderNotes}
              sort=${sort}
              order=${order}
              onSort=${onSort}
              loading=${logsRes.loading}
              emptyMessage=${search ? 'No log entries match your search.' : 'No maintenance logged yet.'}
            />
            ${pageData
          ? html`<${Pagination}
                  page=${pageData.page}
                  pageSize=${pageData.pageSize}
                  total=${pageData.total}
                  onPage=${(/** @type {number} */ p) => update({ page: p })}
                />`
          : null}
          `}
    </div>
  `;
}
