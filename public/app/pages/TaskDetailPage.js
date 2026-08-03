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
} from '../api/hooks.js';
import { useAuth } from '../auth/auth.js';
import {
  formatDate,
  formatElapsedTime,
  formatHours,
  formatRemainingHours,
  formatRemainingTime,
  formatUser,
  toDateInput,
} from '../lib/format.js';
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
import { apiFetch } from '../api/client.js';
import { stowageItemUrl } from '../api/stowage.js';

/** @typedef {import('../types.js').TaskDTO} TaskDTO */
/** @typedef {import('../types.js').LogDTO} LogDTO */

/** @param {{ slug: string }} props */
export function TaskDetailPage(props) {
  const auth = useAuth();
  const taskRes = useTask(props.slug);
  const logsRes = useTaskLogs(props.slug);

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

  const task = taskRes.data;

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
      render: (/** @type {LogDTO} */ e) =>
        e.logged_by
          ? formatUser(e.logged_by)
          : html`<span class="muted">—</span>`,
    },
  ];
  if (auth.isLoggedIn) {
    logColumns.push({
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

  return html`
    <div>
      <div class="page-header">
        <h1 class="page-title">
          ${task.name} <${StatusBadge} status=${task.status} />
          <${StockBadge} consumables=${consumables} />
          ${
            task.tags.length
              ? html`<span class="chips">
                  ${task.tags.map((tag) => html`<span key=${tag} class="tag">${tag}</span>`)}
                </span>`
              : null
          }
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
                    <i class="bi bi-check2-circle" />Mark complete
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
          // Nothing to say without a description or parts: drop the card.
          task.description || consumables.length
            ? html`<div class="card">
                ${
                  task.description
                    ? html`<h3>Description</h3>
                        <${MarkdownView} markdown=${task.description} />`
                    : null
                }
                ${
                  consumables.length
                    ? html`<div
                        style=${task.description ? 'margin-top:16px' : ''}
                      >
                        <h3>Consumables</h3>
                        <ul class="consumables-list">
                          ${consumables.map(
                            (c) => html`<li
                              key=${c.item_id}
                              class="consumables-row"
                            >
                              <span class="consumables-name"
                                ><a href=${stowageItemUrl(c.item_id)}
                                  >${c.item_name}</a
                                >${' '}
                                <span class="muted"
                                  >× ${c.qty_per_service}</span
                                ></span
                              >
                            </li>`,
                          )}
                        </ul>
                      </div>`
                    : null
                }
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
        rows=${logsRes.data ? logsRes.data.data : []}
        renderDetail=${(/** @type {LogDTO} */ e) =>
          e.notes
            ? html`<div class="log-notes">
                <div class="log-notes-body">
                  <${MarkdownView} markdown=${e.notes} />
                </div>
              </div>`
            : null}
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
