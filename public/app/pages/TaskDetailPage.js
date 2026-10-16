/**
 * Task detail (§7.4): description, tags, intervals, runtime/time progress,
 * status, per-task log with edit/delete, and the complete/edit/delete modals.
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import {
  useTask,
  useTaskLogs,
  updateTask,
  deleteTask,
  deleteLog,
  taskFileUrl,
} from '../api/hooks.js';
import { useAuth } from '../auth/auth.js';
import {
  formatCost,
  formatDate,
  formatElapsedTime,
  formatHours,
  formatRemainingHours,
  formatRemainingTime,
  formatUser,
  formatWorkHours,
  toDateInput,
} from '../lib/format.js';
import { aggregateOf, isRecorded } from '../lib/stats.js';
import { splitAttachments } from '../lib/files.js';
import { navigate } from '../lib/router.js';
import { toast } from '../lib/toasts.js';
import { Table } from '../components/Table.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { StockBadge } from '../components/StockBadge.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { StatTable } from '../components/StatTable.js';
import { MarkdownView } from '../components/MarkdownView.js';
import { TaskFormModal } from '../components/TaskFormModal.js';
import { LogEntryModal } from '../components/LogEntryModal.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { DownloadLogModal } from '../components/DownloadLogModal.js';
import { FileList, ImageGallery } from '../components/AttachmentList.js';
import { LogDetailsModal } from '../components/LogDetailsModal.js';
import { apiFetch } from '../api/client.js';
import { stockLevel, stowageItemUrl, useStowageItems } from '../api/stowage.js';

/** @typedef {import('../types.js').TaskDTO} TaskDTO */
/** @typedef {import('../types.js').LogDTO} LogDTO */

/** @param {{ slug: string }} props */
export function TaskDetailPage(props) {
  const auth = useAuth();
  const taskRes = useTask(props.slug);
  const logsRes = useTaskLogs(props.slug);
  const stowageItems = useStowageItems();
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [editingEntry, setEditingEntry] = useState(
    /** @type {LogDTO|null} */ (null),
  );
  const [deletingEntry, setDeletingEntry] = useState(
    /** @type {LogDTO|null} */ (null),
  );
  const [downloadingLog, setDownloadingLog] = useState(false);
  const [viewingEntry, setViewingEntry] = useState(
    /** @type {LogDTO|null} */ (null),
  );

  const task = taskRes.data;
  const logRows = logsRes.data ? logsRes.data.data : [];

  if (taskRes.error && !task) {
    return html`<div class="error-box">
      Failed to load task: ${taskRes.error.message}
    </div>`;
  }
  if (!task) {
    return html`<div class="table-loading">Loading…</div>`;
  }

  /** @type {import('../components/Table.js').Column[]} */
  const logColumns = [
    {
      key: 'maintenance_date',
      label: 'Date',
      className: 'num',
      render: (/** @type {LogDTO} */ e) => formatDate(e.maintenance_date),
    },
    {
      key: 'runtime_hours',
      label: 'Runtime',
      className: 'num',
      render: (/** @type {LogDTO} */ e) => formatHours(e.runtime_hours),
    },
    {
      key: 'logged_by',
      label: 'By',
      className: 'hide-sm',
      render: (/** @type {LogDTO} */ e) =>
        e.logged_by
          ? formatUser(e.logged_by)
          : html`<span class="muted">—</span>`,
    },
  ];
  // Details are viewable by anyone; edit/delete need a login.
  logColumns.push({
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

  const runtimeConfigured = task.runtime_interval !== null;
  const timeConfigured = task.time_interval !== null;
  const dueDateConfigured = task.due_date !== null;

  // Each card draws whatever its dimension actually knows. An interval is what
  // makes something due, but a bare log entry or runtime reading still answers
  // "when/at what hours was this last done, and how long since" — so a task
  // with no interval at all is not an empty card.
  const hasSchedule =
    timeConfigured || dueDateConfigured || task.last_maintenance !== null;
  const hasRuntime =
    runtimeConfigured ||
    task.runtime_path !== null ||
    task.current_runtime !== null ||
    task.last_runtime !== null;

  const consumables = task.consumables || [];
  const files = task.files || [];
  const { images, documents } = splitAttachments(files);
  /** @param {import('../types.js').FileDTO} f */
  const fileUrl = (f) => taskFileUrl(task.slug, f.id);

  // Live stock levels for the "required / in stock" figures. Shared with the
  // StockBadge subscription, so this adds no extra polling. Stays undefined
  // (figure hidden) while loading or when stowage-mgmt isn't reachable.
  const stockById = new Map((stowageItems.data || []).map((i) => [i.id, i]));

  /** @type {import('../components/Table.js').Column[]} */
  const consumableColumns = [
    {
      key: 'item_name',
      label: 'Item',
      className: 'col-name',
      render: (/** @type {import('../types.js').TaskConsumableDTO} */ c) =>
        html`<a href=${stowageItemUrl(c.item_id)}>${c.item_name}</a>`,
    },
    {
      key: 'qty_per_service',
      label: 'Quantity',
      className: 'num',
      render: (/** @type {import('../types.js').TaskConsumableDTO} */ c) => {
        const item = stockById.get(c.item_id);
        // An item stowage-mgmt no longer knows: just the required qty,
        // uncoloured.
        if (!item) return html`<span class="muted">${c.qty_per_service}</span>`;
        // Enough for this job: green, or orange when that still leaves the
        // item below its restock target.
        const cls = stockLevel(item, c.qty_per_service);
        return html`<span
          class=${'consumables-stock ' + cls}
          title=${
            'Need ' +
            c.qty_per_service +
            ', ' +
            item.actual_quantity +
            ' in stock' +
            (cls === 'low'
              ? ' (below target of ' + item.target_quantity + ')'
              : '')
          }
          >${c.qty_per_service + ' / ' + item.actual_quantity}</span
        >`;
      },
    },
  ];

  // With both a recurring interval and a one-time deadline set, the deadline
  // takes a row of its own; on its own it simply is the next thing due.
  const bothTimeDimensions = timeConfigured && dueDateConfigured;

  // "Next" is whichever time sub-dimension comes first — the same choice the
  // backend makes for remaining_time_ms, so the two rows always agree.
  const nextDueIso =
    task.scheduled_remaining_ms !== null && task.due_date_remaining_ms !== null
      ? task.scheduled_remaining_ms <= task.due_date_remaining_ms
        ? task.scheduled_due_date
        : task.due_date
      : (task.scheduled_due_date ?? task.due_date);

  /** Remaining figure colored by its sub-status, as in the task list. */
  const remaining = (
    /** @type {string} */ text,
    /** @type {import('../types.js').Status|null} */ status,
  ) => html`<span class=${'remaining ' + (status || '')}>${text}</span>`;

  // Per-task "due soon" lead windows, shown only when overriding the plugin
  // default (null = default, 0 = no warning).
  const warnHint = (
    /** @type {number|null} */ value,
    /** @type {string} */ unit,
  ) =>
    value === null
      ? null
      : html`<div class="field-hint">
          ${
            value === 0
              ? 'No due-soon warning.'
              : 'Warns ' + value + unit + ' early.'
          }
        </div>`;

  // Labour and cost: the task's estimate against what its log entries
  // recorded. Each card only appears once there's something to put in it.
  const hours = aggregateOf(logRows.map((e) => e.actual_hours));
  const cost = aggregateOf(logRows.map((e) => e.actual_cost));
  const hasTime = isRecorded(task.estimated_hours) || hours.count > 0;
  const hasCost = isRecorded(task.estimated_cost) || cost.count > 0;

  // The gallery is the last card, so it can stretch over whatever columns its
  // row has left — roughly one per two thumbnails — without displacing any
  // other card. Schedule is the one card that always shows.
  const cardsBeforeGallery = [
    task.description,
    true,
    hasRuntime,
    hasTime,
    hasCost,
    consumables.length,
    documents.length,
  ].filter(Boolean).length;
  const galleryColumns = Math.min(
    Math.ceil(images.length / 2),
    3 - (cardsBeforeGallery % 3),
  );
  /**
   * @param {number|null|undefined} estimated
   * @param {import('../types.js').Aggregate} actual
   * @param {(n: number|null) => string} format
   */
  const workRows = (estimated, actual, format) => [
    {
      label: 'Estimated',
      value: isRecorded(estimated) ? format(estimated) : null,
    },
    { label: 'Total', value: actual.count ? format(actual.total) : null },
    {
      label: 'Average',
      value: actual.count
        ? html`${format(actual.average)}${' '}<span class="muted stat-note"
              >(${actual.count} ${actual.count === 1 ? 'entry' : 'entries'})</span
            >`
        : null,
    },
  ];

  return html`
    <div>
      <div class="page-header detail-header">
        <h1 class="page-title">
          ${task.name}
          <span class="page-title-meta">
            <${StatusBadge} status=${task.status} />
            <${StockBadge} consumables=${consumables} />
            ${
              task.tags.length
                ? html`<span class="chips">
                    ${task.tags.map((tag) => html`<span key=${tag} class="tag">${tag}</span>`)}
                  </span>`
                : null
            }
          </span>
        </h1>
        ${
          auth.isLoggedIn
            ? html`
                <span class="page-actions">
                  <button
                    type="button"
                    class="btn btn-success"
                    onClick=${() => setCompleting(true)}
                  >
                    <i class="bi bi-check2-circle" />Complete
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary"
                    onClick=${() => setEditing(true)}
                  >
                    <i class="bi bi-pencil" />Edit
                  </button>
                  <button
                    type="button"
                    class="btn btn-warning"
                    onClick=${async () => {
                      await updateTask(task.slug, {
                        is_archived: !task.is_archived,
                      });
                      toast(
                        task.is_archived
                          ? 'Task unarchived.'
                          : 'Task archived.',
                        'success',
                      );
                    }}
                  >
                    <i class="bi bi-archive" />${task.is_archived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    type="button"
                    class="btn btn-danger"
                    onClick=${() => setDeletingTask(true)}
                  >
                    <i class="bi bi-trash" />Delete
                  </button>
                </span>
              `
            : null
        }
      </div>

      <div class="detail-grid">
        ${
          task.description
            ? html`<div class="card">
                <h3>Description</h3>
                <${MarkdownView} markdown=${task.description} />
              </div>`
            : null
        }

        <div class="card">
          <h3>Schedule</h3>
          ${
            !hasSchedule
              ? html`<p class="muted" style="margin:0">
                  No interval or due date configured.
                </p>`
              : html`
                  <${StatTable}
                    rows=${[
                      {
                        label: 'Interval',
                        value: timeConfigured
                          ? 'every ' +
                            task.time_interval +
                            ' ' +
                            task.time_interval_unit
                          : null,
                      },
                      {
                        // Only when a recurring interval owns the Next row —
                        // on its own the deadline *is* the next thing due.
                        label: 'Deadline',
                        value: bothTimeDimensions
                          ? formatDate(task.due_date)
                          : null,
                      },
                      { label: 'Today', value: toDateInput() },
                      {
                        label: 'Last',
                        value:
                          task.last_maintenance !== null
                            ? formatDate(task.last_maintenance)
                            : null,
                      },
                      {
                        label: 'Elapsed',
                        value:
                          task.elapsed_time_ms !== null
                            ? formatElapsedTime(task.elapsed_time_ms)
                            : null,
                      },
                      {
                        label: 'Next',
                        value:
                          nextDueIso !== null ? formatDate(nextDueIso) : null,
                      },
                      {
                        label: 'Remaining',
                        value:
                          task.remaining_time_ms !== null
                            ? remaining(
                                formatRemainingTime(task.remaining_time_ms),
                                task.time_status,
                              )
                            : null,
                      },
                    ]}
                  />
                  ${warnHint(task.time_warning_days, 'd')}
                  <${ProgressBar}
                    fraction=${task.time_fraction}
                    status=${task.time_status}
                  />
                `
          }
        </div>

        ${
          // Nothing to say about runtime on a task that doesn't track it —
          // the remaining cards spread to fill the row.
          hasRuntime
            ? html`
                <div class="card">
                  <h3>Runtime</h3>
                  <${StatTable}
                    rows=${[
                      {
                        label: 'Interval',
                        value: runtimeConfigured
                          ? 'every ' + formatHours(task.runtime_interval)
                          : null,
                      },
                      {
                        label: 'Current',
                        value:
                          task.current_runtime !== null
                            ? formatHours(task.current_runtime)
                            : null,
                      },
                      {
                        label: 'Last',
                        value:
                          task.last_runtime !== null
                            ? formatHours(task.last_runtime)
                            : null,
                      },
                      {
                        label: 'Elapsed',
                        value:
                          task.elapsed_runtime !== null
                            ? formatHours(task.elapsed_runtime)
                            : null,
                      },
                      {
                        label: 'Next',
                        value:
                          task.due_runtime_at !== null
                            ? formatHours(task.due_runtime_at)
                            : null,
                      },
                      {
                        label: 'Remaining',
                        value:
                          task.remaining_runtime !== null
                            ? remaining(
                                formatRemainingHours(task.remaining_runtime),
                                task.runtime_status,
                              )
                            : null,
                      },
                    ]}
                  />
                  ${warnHint(task.runtime_warning_hours, 'h')}
                  <${ProgressBar}
                    fraction=${task.runtime_fraction}
                    status=${task.runtime_status}
                  />
                </div>
              `
            : null
        }

        ${
          hasTime
            ? html`<div class="card">
                <h3>Time</h3>
                <${StatTable}
                  rows=${workRows(task.estimated_hours, hours, formatWorkHours)}
                />
              </div>`
            : null
        }
        ${
          hasCost
            ? html`<div class="card">
                <h3>Costs</h3>
                <${StatTable}
                  rows=${workRows(task.estimated_cost, cost, formatCost)}
                />
              </div>`
            : null
        }
        ${
          consumables.length
            ? html`<div class="card">
                <h3>Consumables</h3>
                <div class="consumables-table">
                  <${Table}
                    columns=${consumableColumns}
                    rows=${consumables}
                    rowKey=${(
                      /** @type {import('../types.js').TaskConsumableDTO} */ c,
                    ) => c.item_id}
                  />
                </div>
              </div>`
            : null
        }
        ${
          documents.length
            ? html`<div class="card">
                <h3>Files</h3>
                <${FileList} files=${documents} urlFor=${fileUrl} />
              </div>`
            : null
        }
        ${
          images.length
            ? html`<div
                class="card card-gallery"
                style=${'--gallery-columns:' + galleryColumns}
              >
                <h3>Gallery</h3>
                <${ImageGallery} files=${images} urlFor=${fileUrl} />
              </div>`
            : null
        }
      </div>

      <div class="page-header" style="margin-top:24px">
        <h2 class="page-title" style="font-size:17px">Maintenance log</h2>
        ${
          logsRes.data && logsRes.data.data.length
            ? html`<span class="page-actions">
                <button
                  type="button"
                  class="btn btn-primary"
                  onClick=${() => setDownloadingLog(true)}
                >
                  <i class="bi bi-download" />Download log
                </button>
              </span>`
            : null
        }
      </div>
      <${Table}
        columns=${logColumns}
        rows=${logRows}
        loading=${logsRes.loading}
        emptyMessage="No maintenance logged yet."
      />

      ${
        editing
          ? html`<${TaskFormModal}
              task=${task}
              onClose=${() => setEditing(false)}
              onSaved=${(/** @type {TaskDTO} */ saved) => {
                if (saved.slug !== props.slug)
                  navigate('/tasks/' + encodeURIComponent(saved.slug));
              }}
            />`
          : null
      }
      ${
        downloadingLog
          ? html`<${DownloadLogModal}
              title=${'Download log — ' + task.name}
              filenameBase=${'signalk-maintenance-log-' + task.slug}
              fetchEntries=${async () => {
                const res = await apiFetch(
                  '/tasks/' + encodeURIComponent(task.slug) + '/logs',
                );
                return res.data;
              }}
              onClose=${() => setDownloadingLog(false)}
            />`
          : null
      }
      ${completing ? html`<${LogEntryModal} task=${task} onClose=${() => setCompleting(false)} />` : null}
      ${editingEntry ? html`<${LogEntryModal} entry=${editingEntry} onClose=${() => setEditingEntry(null)} />` : null}
      ${
        viewingEntry
          ? html`<${LogDetailsModal}
              entry=${viewingEntry}
              subject=${task.name}
              onClose=${() => setViewingEntry(null)}
            />`
          : null
      }
      ${
        deletingTask
          ? html`<${ConfirmModal}
              title="Delete task"
              message=${'Delete "' + task.name + '" and its entire maintenance log? This cannot be undone.'}
              onConfirm=${async () => {
                await deleteTask(task.slug);
                toast('Task deleted.', 'success');
                navigate('/');
              }}
              onClose=${() => setDeletingTask(false)}
            />`
          : null
      }
      ${
        deletingEntry
          ? html`<${ConfirmModal}
              title="Delete log entry"
              message="Delete this log entry? The task's last-maintenance data will be recomputed."
              onConfirm=${async () => {
                await deleteLog(deletingEntry.id, task.slug);
                toast('Log entry deleted.', 'success');
                setDeletingEntry(null);
              }}
              onClose=${() => setDeletingEntry(null)}
            />`
          : null
      }
    </div>
  `;
}
