/**
 * Master log (§7.4): one row per log entry across all tasks, plus standalone
 * (non-task) entries listed under their own title. Server-side
 * search/sort/pagination, a details modal per entry (notes, attachments), and
 * — when logged in — creating standalone entries and editing/deleting any
 * entry.
 */
import { html } from '../lib/html.js';
import { useState, useEffect } from '../../vendor/preact-hooks.js';
import { useLogs, deleteLog } from '../api/hooks.js';
import { apiFetch, buildQuery } from '../api/client.js';
import { useAuth } from '../auth/auth.js';
import { useListParams } from '../lib/useListParams.js';
import { formatDate, formatHours } from '../lib/format.js';
import { toast } from '../lib/toasts.js';
import { Table } from '../components/Table.js';
import { Pagination } from '../components/Pagination.js';
import { DownloadLogModal } from '../components/DownloadLogModal.js';
import {
  TotalsBar,
  averageOf,
  countOf,
  totalOf,
} from '../components/TotalsBar.js';
import { LogEntryModal } from '../components/LogEntryModal.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { LogDetailsModal } from '../components/LogDetailsModal.js';

/** @typedef {import('../types.js').LogDTO} LogDTO */

const PAGE_SIZE = 25;
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
  const [viewingEntry, setViewingEntry] = useState(
    /** @type {LogDTO|null} */ (null),
  );

  const pageData = logsRes.data;
  const rows = pageData ? pageData.data : [];

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
      className: 'col-truncate',
      // Standalone entries have no task to link to — their title stands in.
      render: (/** @type {LogDTO} */ e) =>
        e.task_slug !== null
          ? html`<a
              href=${'#/tasks/' + encodeURIComponent(e.task_slug)}
              title=${e.task_name}
              >${e.task_name}</a
            >`
          : html`<span title=${e.title}>${e.title}</span>`,
    },
    {
      key: 'maintenance_date',
      label: 'Date',
      sortable: true,
      className: 'num hide-sm',
      render: (/** @type {LogDTO} */ e) => formatDate(e.maintenance_date),
    },
    {
      key: 'runtime_hours',
      label: 'Runtime',
      sortable: true,
      className: 'num hide-sm',
      render: (/** @type {LogDTO} */ e) => formatHours(e.runtime_hours),
    },
  ];
  // Details are viewable by anyone; edit/delete need a login.
  columns.push({
    key: 'actions',
    label: '',
    className: 'actions',
    render: (/** @type {LogDTO} */ e) => html`
      <button
        type="button"
        class="btn-icon success"
        aria-label="View log entry details"
        title="Details"
        onClick=${() => setViewingEntry(e)}
      >
        <i class="bi bi-search" />
      </button>
      ${
        auth.isLoggedIn
          ? html`<button
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
              </button>`
          : null
      }
    `,
  });

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
        viewingEntry
          ? html`<${LogDetailsModal}
              entry=${viewingEntry}
              subject=${viewingEntry.task_name || viewingEntry.title}
              onClose=${() => setViewingEntry(null)}
            />`
          : null
      }
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
                rows=${rows}
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
              ${
                pageData && pageData.stats
                  ? html`<${TotalsBar}
                      items=${[
                        {
                          label: 'Total time',
                          value: totalOf(pageData.stats.hours, 'hours'),
                        },
                        {
                          label: 'Average time',
                          value: averageOf(pageData.stats.hours, 'hours'),
                        },
                        {
                          label: 'Total cost',
                          value: totalOf(pageData.stats.cost, 'cost'),
                        },
                        {
                          label: 'Average cost',
                          value: averageOf(pageData.stats.cost, 'cost'),
                        },
                      ]}
                      note=${'Across all ' + countOf(pageData.total, 'log entry', 'log entries') + ' matching the current search, not just the ones shown on this page. Averages only count entries that recorded a time or cost.'}
                    />`
                  : null
              }
            `
      }
    </div>
  `;
}
