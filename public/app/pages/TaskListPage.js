/**
 * Task list — the main page (§7.4). Server-side search/filter/sort/paging;
 * write affordances render only when logged in (§7.7).
 */
import { html } from '../lib/html.js';
import { useState, useEffect } from '../../vendor/preact-hooks.js';
import { useTasks, useTags, deleteTask } from '../api/hooks.js';
import { useAuth } from '../auth/auth.js';
import { useListParams } from '../lib/useListParams.js';
import { formatDate, formatRemainingHours, formatRemainingTime } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { toast } from '../lib/toasts.js';
import { Table } from '../components/Table.js';
import { Pagination } from '../components/Pagination.js';
import { StatusBadge } from '../components/StatusBadge.js';
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
  const sort = params.sort || '';
  const order = params.order || '';

  // Debounce typed search into the URL (and thus the query key).
  const [searchText, setSearchText] = useState(search);
  useEffect(() => {
    setSearchText(search);
  }, [search]);
  useEffect(() => {
    if (searchText === search) return undefined;
    const timer = setTimeout(() => update({ search: searchText, page: undefined }), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const tasksRes = useTasks({
    search: search || undefined,
    tags: tagsCsv || undefined,
    sort: sort || undefined,
    order: order || undefined,
    page: page,
    pageSize: PAGE_SIZE,
  });
  const tagsRes = useTags();

  /** @type {[TaskDTO|null|undefined, any]} editor: undefined=closed, null=create, TaskDTO=edit */
  const [editorTask, setEditorTask] = useState(/** @type {TaskDTO|null|undefined} */(undefined));
  const [completing, setCompleting] = useState(/** @type {TaskDTO|null} */(null));
  const [deleting, setDeleting] = useState(/** @type {TaskDTO|null} */(null));

  const selectedTags = tagsCsv ? tagsCsv.split(',').filter(Boolean) : [];
  /** @param {string} tag */
  const toggleTag = (tag) => {
    const next = selectedTags.indexOf(tag) === -1
      ? selectedTags.concat([tag])
      : selectedTags.filter((t) => t !== tag);
    update({ tags: next.join(',') || undefined, page: undefined });
  };

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
      render: (/** @type {TaskDTO} */ t) => html`<${StatusBadge} status=${t.status} />`,
    },
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (/** @type {TaskDTO} */ t) => html`<a href=${'#/tasks/' + encodeURIComponent(t.slug)}>${t.name}</a>`,
    },
    {
      key: 'tags',
      label: 'Tags',
      render: (/** @type {TaskDTO} */ t) =>
        html`<span class="chips">${t.tags.map((tag) => html`<span key=${tag} class="tag">${tag}</span>`)}</span>`,
    },
    {
      key: 'remaining_runtime',
      label: 'Runtime left',
      sortable: true,
      className: 'num',
      render: (/** @type {TaskDTO} */ t) =>
        html`<span class=${'remaining ' + (t.runtime_status || '')}>${formatRemainingHours(t.remaining_runtime)}</span>`,
    },
    {
      key: 'remaining_time',
      label: 'Time left',
      sortable: true,
      className: 'num',
      render: (/** @type {TaskDTO} */ t) =>
        html`<span class=${'remaining ' + (t.time_status || '')}>${formatRemainingTime(t.remaining_time_ms)}</span>`,
    },
    {
      key: 'due_date',
      label: 'Next due',
      className: 'num',
      render: (/** @type {TaskDTO} */ t) => formatDate(t.due_date),
    },
    {
      key: 'actions',
      label: '',
      className: 'actions',
      render: (/** @type {TaskDTO} */ t) => html`
        ${auth.isLoggedIn
          ? html`
              <button type="button" class="btn-icon success" aria-label=${'Complete ' + t.name} title="Mark complete"
                onClick=${() => setCompleting(t)}>
                <i class="bi bi-check2-circle" />
              </button>
              <button type="button" class="btn-icon primary" aria-label=${'Edit ' + t.name} title="Edit"
                onClick=${() => setEditorTask(t)}>
                <i class="bi bi-pencil" />
              </button>
              <button type="button" class="btn-icon danger" aria-label=${'Delete ' + t.name} title="Delete"
                onClick=${() => setDeleting(t)}>
                <i class="bi bi-trash" />
              </button>
            `
          : null}
      `,
    },
  ];

  const pageData = tasksRes.data;

  return html`
    <div>
      <div class="page-header">
        <h1 class="page-title">Maintenance Tasks</h1>
        ${auth.isLoggedIn
      ? html`
              <button type="button" class="btn btn-primary" onClick=${() => setEditorTask(null)}>
                <i class="bi bi-plus-lg" />New task
              </button>
            `
      : null}
      </div>

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
        <div class="chips">
          ${(tagsRes.data ? tagsRes.data.data : []).map(
        (tag) => html`
              <button
                type="button"
                key=${tag.name}
                class=${'chip' + (selectedTags.indexOf(tag.name) !== -1 ? ' selected' : '')}
                onClick=${() => toggleTag(tag.name)}
              >
                ${tag.name}<span class="chip-count">${tag.count}</span>
              </button>
            `
      )}
        </div>
      </div>

      ${tasksRes.error && !pageData
      ? html`<div class="error-box">Failed to load tasks: ${tasksRes.error.message}</div>`
      : html`
            <${Table}
              columns=${columns}
              rows=${pageData ? pageData.data : []}
              sort=${sort}
              order=${order}
              onSort=${onSort}
              loading=${tasksRes.loading}
              emptyMessage=${search || tagsCsv ? 'No tasks match your filters.' : 'No maintenance tasks yet.'}
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

      ${editorTask !== undefined
      ? html`<${TaskFormModal} task=${editorTask} onClose=${() => setEditorTask(undefined)} />`
      : null}
      ${completing ? html`<${LogEntryModal} task=${completing} onClose=${() => setCompleting(null)} />` : null}
      ${deleting
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
      : null}
    </div>
  `;
}
