/**
 * Task list — the main page (§7.4). Server-side search/filter/sort/paging;
 * write affordances render only when logged in (§7.7).
 */
import { html } from '../lib/html.js';
import { useState, useEffect } from '../../vendor/preact-hooks.js';
import { useTasks, useTags, deleteTask } from '../api/hooks.js';
import { useAuth } from '../auth/auth.js';
import { useListParams } from '../lib/useListParams.js';
import {
  STATUSES,
  formatRemainingHours,
  formatRemainingTime,
  statusLabel,
} from '../lib/format.js';
import { toast } from '../lib/toasts.js';
import { Table } from '../components/Table.js';
import { Pagination } from '../components/Pagination.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { StockBadge } from '../components/StockBadge.js';
import { TaskFormModal } from '../components/TaskFormModal.js';
import { LogEntryModal } from '../components/LogEntryModal.js';
import { ConfirmModal } from '../components/ConfirmModal.js';

/** @typedef {import('../types.js').TaskDTO} TaskDTO */

const PAGE_SIZE = 20;

export function TaskListPage() {
  const { params, update } = useListParams();
  const auth = useAuth();

  const page = parseInt(params.page || '1', 10) || 1;
  const search = params.search || '';
  const tagsCsv = params.tags || '';
  const statusCsv = params.status || '';
  const sort = params.sort || '';
  const order = params.order || '';

  // Debounce typed search into the URL (and thus the query key).
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

  const tasksRes = useTasks({
    search: search || undefined,
    tags: tagsCsv || undefined,
    status: statusCsv || undefined,
    sort: sort || undefined,
    order: order || undefined,
    page: page,
    pageSize: PAGE_SIZE,
  });
  const tagsRes = useTags();

  /** @type {[TaskDTO|null|undefined, any]} editor: undefined=closed, null=create, TaskDTO=edit */
  const [editorTask, setEditorTask] = useState(
    /** @type {TaskDTO|null|undefined} */ (undefined),
  );
  const [completing, setCompleting] = useState(
    /** @type {TaskDTO|null} */ (null),
  );
  const [deleting, setDeleting] = useState(/** @type {TaskDTO|null} */ (null));

  // Tags and status are single-select, so search, tag and status simply AND
  // together. A task has exactly one status, and tags are used as categories,
  // so combining two of either narrows to nothing more often than not. Clicking
  // a chip replaces the current selection; clicking the selected one clears it.
  // The API still accepts CSV, so a hand-written multi-value URL keeps
  // filtering (and highlighting) — it just collapses on the next click.
  const selectedTags = tagsCsv ? tagsCsv.split(',').filter(Boolean) : [];
  /** @param {string} tag */
  const selectTag = (tag) =>
    update({
      tags: selectedTags.indexOf(tag) === -1 ? tag : undefined,
      page: undefined,
    });

  const selectedStatuses = statusCsv
    ? statusCsv.split(',').filter(Boolean)
    : [];
  /** @param {string} status */
  const selectStatus = (status) =>
    update({
      status: selectedStatuses.indexOf(status) === -1 ? status : undefined,
      page: undefined,
    });

  /** @param {string} key */
  const onSort = (key) => {
    if (sort === key) update({ order: order === 'asc' ? 'desc' : 'asc' });
    else update({ sort: key, order: 'asc' });
  };

  /** @type {import('../components/Table.js').Column[]} */
  const columns = [
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      className: 'col-status',
      render: (/** @type {TaskDTO} */ t) =>
        html`<span class="status-badges"
          ><${StatusBadge} status=${t.status} /><${StockBadge} consumables=${t.consumables}
        /></span>`,
    },
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (/** @type {TaskDTO} */ t) =>
        html`<a href=${'#/tasks/' + encodeURIComponent(t.slug)}>${t.name}</a>`,
    },
    {
      key: 'remaining_runtime',
      label: 'Runtime Left',
      sortable: true,
      className: 'num hide-sm',
      render: (/** @type {TaskDTO} */ t) =>
        html`<span class=${'remaining ' + (t.runtime_status || '')}
          >${formatRemainingHours(t.remaining_runtime)}</span
        >`,
    },
    {
      key: 'remaining_time',
      label: 'Time left',
      sortable: true,
      className: 'num hide-sm',
      render: (/** @type {TaskDTO} */ t) =>
        html`<span class=${'remaining ' + (t.time_status || '')}
          >${formatRemainingTime(t.remaining_time_ms)}</span
        >`,
    },
    {
      key: 'actions',
      label: '',
      className: 'actions',
      render: (/** @type {TaskDTO} */ t) => html`
        ${
          auth.isLoggedIn
            ? html`
                <button
                  type="button"
                  class="btn-icon success"
                  aria-label=${'Complete ' + t.name}
                  title="Mark complete"
                  onClick=${() => setCompleting(t)}
                >
                  <i class="bi bi-check2-circle" />
                </button>
                <button
                  type="button"
                  class="btn-icon primary"
                  aria-label=${'Edit ' + t.name}
                  title="Edit"
                  onClick=${() => setEditorTask(t)}
                >
                  <i class="bi bi-pencil" />
                </button>
                <button
                  type="button"
                  class="btn-icon danger"
                  aria-label=${'Delete ' + t.name}
                  title="Delete"
                  onClick=${() => setDeleting(t)}
                >
                  <i class="bi bi-trash" />
                </button>
              `
            : null
        }
      `,
    },
  ];

  const tagList = tagsRes.data ? tagsRes.data.data : [];
  const pageData = tasksRes.data;
  // Server-computed facets: what each status chip would return, given the
  // search and tag already in effect. Absent until the first response lands.
  const statusCounts = pageData ? pageData.statusCounts : null;

  return html`
    <div>
      <div class="toolbar">
        <div class="search-box">
          <i class="bi bi-search" />
          <input
            class="input"
            placeholder="Search tasks…"
            aria-label="Search tasks"
            value=${searchText}
            onInput=${(/** @type {any} */ e) => setSearchText(e.currentTarget.value)}
          />
        </div>
        ${
          auth.isLoggedIn
            ? html`
                <button
                  type="button"
                  class="btn btn-primary toolbar-action"
                  onClick=${() => setEditorTask(null)}
                >
                  <i class="bi bi-plus-lg" />New task
                </button>
              `
            : null
        }
      </div>

      <div class="chip-filters">
        ${
          tagList.length
            ? html`
                <div class="chips" role="group" aria-labelledby="tag-filter-label">
                  <span class="chips-label" id="tag-filter-label">Tags:</span>
                  ${tagList.map(
                    (tag) => html`
                      <button
                        type="button"
                        key=${tag.name}
                        class=${'chip' + (selectedTags.indexOf(tag.name) !== -1 ? ' selected' : '')}
                        aria-pressed=${selectedTags.indexOf(tag.name) !== -1}
                        onClick=${() => selectTag(tag.name)}
                      >
                        ${tag.name}<span class="chip-count">${tag.count}</span>
                      </button>
                    `,
                  )}
                </div>
              `
            : null
        }
        <div class="chips" role="group" aria-labelledby="status-filter-label">
          <span class="chips-label" id="status-filter-label">Status:</span>
          ${STATUSES.map(
            (status) => html`
              <button
                type="button"
                key=${status}
                class=${'chip' + (selectedStatuses.indexOf(status) !== -1 ? ' selected' : '')}
                aria-pressed=${selectedStatuses.indexOf(status) !== -1}
                onClick=${() => selectStatus(status)}
              >
                ${statusLabel(status)}${
                  statusCounts
                    ? html`<span class="chip-count">${statusCounts[status] || 0}</span>`
                    : null
                }
              </button>
            `,
          )}
        </div>
      </div>

      ${
        tasksRes.error && !pageData
          ? html`<div class="error-box">
              Failed to load tasks: ${tasksRes.error.message}
            </div>`
          : html`
              <${Table}
                columns=${columns}
                rows=${pageData ? pageData.data : []}
                sort=${sort}
                order=${order}
                onSort=${onSort}
                loading=${tasksRes.loading}
                emptyMessage=${search || tagsCsv || statusCsv ? 'No tasks match your filters.' : 'No maintenance tasks yet.'}
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
      ${
        editorTask !== undefined
          ? html`<${TaskFormModal}
              task=${editorTask}
              onClose=${() => setEditorTask(undefined)}
            />`
          : null
      }
      ${completing ? html`<${LogEntryModal} task=${completing} onClose=${() => setCompleting(null)} />` : null}
      ${
        deleting
          ? html`<${ConfirmModal}
              title="Delete task"
              message=${'Delete "' + deleting.name + '" and its entire maintenance log? This cannot be undone.'}
              onConfirm=${async () => {
                await deleteTask(deleting.slug);
                toast('Task deleted.', 'success');
                setDeleting(null);
              }}
              onClose=${() => setDeleting(null)}
            />`
          : null
      }
    </div>
  `;
}
