/**
 * Master log (§7.4): one row per log entry across all tasks, plus standalone
 * (non-task) entries listed under their own title. Server-side
 * search/sort/pagination, truncated-but-expandable notes, and — when logged
 * in — creating standalone entries and editing/deleting any entry.
 */
import { html } from '../lib/html.js';
import { useState, useEffect } from '../../vendor/preact-hooks.js';
import { useLogs, deleteLog } from '../api/hooks.js';
import { apiFetch, buildQuery } from '../api/client.js';
import { useAuth } from '../auth/auth.js';
import { useListParams } from '../lib/useListParams.js';
import {
  formatDate,
  formatHours,
  formatUser,
  truncate,
} from '../lib/format.js';
import { toast } from '../lib/toasts.js';
import { Table } from '../components/Table.js';
import { Pagination } from '../components/Pagination.js';
import { MarkdownView } from '../components/MarkdownView.js';
import { DownloadLogModal } from '../components/DownloadLogModal.js';
import { LogEntryModal } from '../components/LogEntryModal.js';
import { ConfirmModal } from '../components/ConfirmModal.js';

/** @typedef {import('../types.js').LogDTO} LogDTO */

const PAGE_SIZE = 25;
const NOTE_PREVIEW_CHARS = 120;
/** Server-side pageSize cap (see MAX_PAGE_SIZE in src/service.ts). */
const EXPORT_PAGE_SIZE = 200;

/** Fetch every log entry, paging past the server's pageSize cap. */
async function fetchAllLogs() {
  /** @type {LogDTO[]} */
  const entries = [];
  for (let page = 1; ; page += 1) {
    /** @type {import('../types.js').Page<LogDTO>} */
    const res = await apiFetch(
      '/logs' + buildQuery({ page, pageSize: EXPORT_PAGE_SIZE }),
    );
    entries.push(...res.data);
    if (res.data.length === 0 || entries.length >= res.total) break;
  }
  return entries;
}

export function MasterLogPage() {
  const auth = useAuth();
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
    const timer = setTimeout(
      () => update({ search: searchText, page: undefined }),
      300,
    );
    return () => clearTimeout(timer);
  }, [searchText]);

  const logsRes = useLogs({
    search: search || undefined,
    sort: sort || undefined,
    order: order || undefined,
    page: page,
    pageSize: PAGE_SIZE,
  });

  const [showDownload, setShowDownload] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingEntry, setEditingEntry] = useState(
    /** @type {LogDTO|null} */ (null),
  );
  const [deletingEntry, setDeletingEntry] = useState(
    /** @type {LogDTO|null} */ (null),
  );

  const [expanded, setExpanded] = useState(
    /** @type {Record<string, boolean>} */ ({}),
  );
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
    else
      update({ sort: key, order: key === 'maintenance_date' ? 'desc' : 'asc' });
  };

  /** @type {import('../components/Table.js').Column[]} */
  const columns = [
    {
      key: 'task',
      label: 'Task',
      sortable: true,
      // Standalone entries have no task to link to — their title stands in.
      render: (/** @type {LogDTO} */ e) =>
        e.task_slug !== null
          ? html`<a href=${'#/tasks/' + encodeURIComponent(e.task_slug)}
              >${e.task_name}</a
            >`
          : e.title,
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
      render: (/** @type {LogDTO} */ e) =>
        e.logged_by
          ? formatUser(e.logged_by)
          : html`<span class="muted">—</span>`,
    },
  ];
  if (auth.isLoggedIn) {
    columns.push({
      key: 'actions',
      label: '',
      className: 'actions',
      render: (/** @type {LogDTO} */ e) => html`
        <button
          type="button"
          class="btn-icon primary"
          aria-label="Edit log entry"
          title="Edit"
          onClick=${() => setEditingEntry(e)}
        >
          <i class="bi bi-pencil" />
        </button>
        <button
          type="button"
          class="btn-icon danger"
          aria-label="Delete log entry"
          title="Delete"
          onClick=${() => setDeletingEntry(e)}
        >
          <i class="bi bi-trash" />
        </button>
      `,
    });
  }

  /** Notes render on their own full-width row under the entry. @param {LogDTO} e */
  const renderNotes = (e) => {
    if (!e.notes) return null;
    const isLong = e.notes.length > NOTE_PREVIEW_CHARS;
    const body =
      expanded[e.id] || !isLong
        ? html`
            <${MarkdownView} markdown=${e.notes} />
            ${
              isLong
                ? html`<button
                    type="button"
                    class="btn-link"
                    onClick=${() => toggleExpanded(e.id)}
                  >
                    less
                  </button>`
                : null
            }
          `
        : html`
            ${truncate(e.notes, NOTE_PREVIEW_CHARS)}${' '}
            <button
              type="button"
              class="btn-link"
              onClick=${() => toggleExpanded(e.id)}
            >
              more
            </button>
          `;
    return html`<div class="log-notes">
      <div class="log-notes-body">${body}</div>
    </div>`;
  };

  const pageData = logsRes.data;

  return html`
    <div>
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
        ${
          auth.isLoggedIn
            ? html`
                <button
                  type="button"
                  class="btn btn-success toolbar-action"
                  onClick=${() => setCreating(true)}
                >
                  <i class="bi bi-plus-lg" />New Entry
                </button>
              `
            : null
        }
        <button
          type="button"
          class="btn btn-primary toolbar-action"
          onClick=${() => setShowDownload(true)}
        >
          <i class="bi bi-download" />Download Log
        </button>
      </div>

      ${
        showDownload
          ? html`<${DownloadLogModal}
              title="Download maintenance log"
              filenameBase="signalk-maintenance-log"
              fetchEntries=${fetchAllLogs}
              onClose=${() => setShowDownload(false)}
            />`
          : null
      }
      ${creating ? html`<${LogEntryModal} onClose=${() => setCreating(false)} />` : null}
      ${editingEntry ? html`<${LogEntryModal} entry=${editingEntry} onClose=${() => setEditingEntry(null)} />` : null}
      ${
        deletingEntry
          ? html`<${ConfirmModal}
              title="Delete log entry"
              message=${
                deletingEntry.task_id !== null
                  ? "Delete this log entry? The task's last-maintenance data will be recomputed."
                  : 'Delete this log entry? This cannot be undone.'
              }
              onConfirm=${async () => {
                await deleteLog(
                  deletingEntry.id,
                  deletingEntry.task_slug || undefined,
                );
                toast('Log entry deleted.', 'success');
                setDeletingEntry(null);
              }}
              onClose=${() => setDeletingEntry(null)}
            />`
          : null
      }

      ${
        logsRes.error && !pageData
          ? html`<div class="error-box">
              Failed to load log: ${logsRes.error.message}
            </div>`
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
              ${
                pageData
                  ? html`<${Pagination}
                      page=${pageData.page}
                      pageSize=${pageData.pageSize}
                      total=${pageData.total}
                      onPage=${(/** @type {number} */ p) => update({ page: p })}
                    />`
                  : null
              }
            `
      }
    </div>
  `;
}
