/**
 * Master log (§7.4): one row per log entry across all tasks. Server-side
 * search/sort/pagination, truncated-but-expandable notes.
 */
import { html } from '../lib/html.js';
import { useState, useEffect } from '../../vendor/preact-hooks.js';
import { useLogs } from '../api/hooks.js';
import { useListParams } from '../lib/useListParams.js';
import { formatDateTime, formatHours, truncate } from '../lib/format.js';
import { Table } from '../components/Table.js';
import { Pagination } from '../components/Pagination.js';
import { MarkdownView } from '../components/MarkdownView.js';

/** @typedef {import('../types.js').LogDTO} LogDTO */

const PAGE_SIZE = 25;
const NOTE_PREVIEW_CHARS = 120;

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

  const [expanded, setExpanded] = useState(/** @type {Record<string, boolean>} */ ({}));
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
      render: (/** @type {LogDTO} */ e) => formatDateTime(e.maintenance_date),
    },
    {
      key: 'runtime_hours',
      label: 'Runtime',
      sortable: true,
      className: 'num',
      render: (/** @type {LogDTO} */ e) => formatHours(e.runtime_hours),
    },
    {
      key: 'notes',
      label: 'Notes',
      className: 'log-notes',
      render: (/** @type {LogDTO} */ e) => {
        if (!e.notes) return html`<span class="muted">—</span>`;
        const isLong = e.notes.length > NOTE_PREVIEW_CHARS;
        if (expanded[e.id] || !isLong) {
          return html`
            <${MarkdownView} markdown=${e.notes} />
            ${isLong
              ? html`<button type="button" class="btn-link" onClick=${() => toggleExpanded(e.id)}>less</button>`
              : null}
          `;
        }
        return html`
          ${truncate(e.notes, NOTE_PREVIEW_CHARS)}${' '}
          <button type="button" class="btn-link" onClick=${() => toggleExpanded(e.id)}>more</button>
        `;
      },
    },
    {
      key: 'logged_by',
      label: 'By',
      render: (/** @type {LogDTO} */ e) => e.logged_by || html`<span class="muted">—</span>`,
    },
  ];

  const pageData = logsRes.data;

  return html`
    <div>
      <div class="page-header">
        <h1 class="page-title">Master log</h1>
      </div>

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
