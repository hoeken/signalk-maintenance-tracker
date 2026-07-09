/**
 * Task detail (§7.4): description, tags, intervals, runtime/time progress,
 * status, per-task log with edit/delete, and the complete/edit/delete modals.
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import { useTask, useTaskLogs, deleteTask, deleteLog } from '../api/hooks.js';
import { useAuth } from '../auth/auth.js';
import {
  formatDate,
  formatHours,
  formatRemainingHours,
  formatRemainingTime,
} from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { toast } from '../lib/toasts.js';
import { Table } from '../components/Table.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { MarkdownView } from '../components/MarkdownView.js';
import { TaskFormModal } from '../components/TaskFormModal.js';
import { LogEntryModal } from '../components/LogEntryModal.js';
import { ConfirmModal } from '../components/ConfirmModal.js';

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
  const [editingEntry, setEditingEntry] = useState(/** @type {LogDTO|null} */ (null));
  const [deletingEntry, setDeletingEntry] = useState(/** @type {LogDTO|null} */ (null));

  const task = taskRes.data;

  if (taskRes.error && !task) {
    return html`<div class="error-box">Failed to load task: ${taskRes.error.message}</div>`;
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
      render: (/** @type {LogDTO} */ e) => e.logged_by || html`<span class="muted">—</span>`,
    },
  ];
  if (auth.isLoggedIn) {
    logColumns.push({
      key: 'actions',
      label: '',
      className: 'actions',
      render: (/** @type {LogDTO} */ e) => html`
        <button type="button" class="btn-icon primary" aria-label="Edit log entry" title="Edit" onClick=${() => setEditingEntry(e)}>
          <i class="bi bi-pencil" />
        </button>
        <button type="button" class="btn-icon danger" aria-label="Delete log entry" title="Delete"
          onClick=${() => setDeletingEntry(e)}>
          <i class="bi bi-trash" />
        </button>
      `,
    });
  }

  const runtimeConfigured = task.runtime_interval !== null;
  const timeConfigured = task.time_interval !== null;

  return html`
    <div>
      <div class="page-header">
        <h1 class="page-title">
          ${task.name} <${StatusBadge} status=${task.status} />
        </h1>
        ${auth.isLoggedIn
          ? html`
              <span class="page-actions">
                <button type="button" class="btn btn-success" onClick=${() => setCompleting(true)}>
                  <i class="bi bi-check2-circle" />Mark complete
                </button>
                <button type="button" class="btn btn-primary" onClick=${() => setEditing(true)}>
                  <i class="bi bi-pencil" />Edit
                </button>
                <button type="button" class="btn btn-danger" onClick=${() => setDeletingTask(true)}>
                  <i class="bi bi-trash" />Delete
                </button>
              </span>
            `
          : null}
      </div>

      <div class="detail-grid">
        <div class="card">
          <h3>Description</h3>
          ${task.description
            ? html`<${MarkdownView} markdown=${task.description} />`
            : html`<p class="muted" style="margin:0">No description.</p>`}
          ${task.tags.length
            ? html`<div class="chips" style="margin-top:12px">
                ${task.tags.map((tag) => html`<span key=${tag} class="tag">${tag}</span>`)}
              </div>`
            : null}
        </div>

        <div class="card">
          <h3>Schedule</h3>
          ${!runtimeConfigured && !timeConfigured
            ? html`<p class="muted" style="margin:0">Informational task — no intervals configured.</p>`
            : null}
          ${runtimeConfigured
            ? html`
                <div class="stat-row">
                  <div class="stat-label">
                    <span>Runtime — every ${formatHours(task.runtime_interval)}</span>
                    <span class="stat-value">${formatRemainingHours(task.remaining_runtime)}${task.remaining_runtime !== null && task.remaining_runtime >= 0 ? ' left' : ''}</span>
                  </div>
                  <${ProgressBar} fraction=${task.runtime_fraction} status=${task.runtime_status} />
                  <div class="field-hint">
                    Current ${formatHours(task.current_runtime)} · last done at ${formatHours(task.last_runtime)} ·
                    due at ${formatHours(task.due_runtime_at)}
                  </div>
                </div>
              `
            : null}
          ${timeConfigured
            ? html`
                <div class="stat-row">
                  <div class="stat-label">
                    <span>Time — every ${task.time_interval} ${task.time_interval_unit}</span>
                    <span class="stat-value">${formatRemainingTime(task.remaining_time_ms)}${task.remaining_time_ms !== null && task.remaining_time_ms >= 0 ? ' left' : ''}</span>
                  </div>
                  <${ProgressBar} fraction=${task.time_fraction} status=${task.time_status} />
                  <div class="field-hint">
                    Last done ${formatDate(task.last_maintenance)} · next due ${formatDate(task.due_date)}
                  </div>
                </div>
              `
            : null}
          ${task.runtime_path
            ? html`<div class="field-hint">Runtime source: <code>${task.runtime_path}</code></div>`
            : null}
        </div>
      </div>

      <div class="page-header" style="margin-top:24px">
        <h2 class="page-title" style="font-size:17px">Maintenance log</h2>
      </div>
      <${Table}
        columns=${logColumns}
        rows=${logsRes.data ? logsRes.data.data : []}
        renderDetail=${(/** @type {LogDTO} */ e) =>
          e.notes
            ? html`<div class="log-notes">
                <strong class="log-notes-label">Notes:</strong>
                <div class="log-notes-body"><${MarkdownView} markdown=${e.notes} /></div>
              </div>`
            : null}
        loading=${logsRes.loading}
        emptyMessage="No maintenance logged yet."
      />

      ${editing
        ? html`<${TaskFormModal}
            task=${task}
            onClose=${() => setEditing(false)}
            onSaved=${(/** @type {TaskDTO} */ saved) => {
              if (saved.slug !== props.slug) navigate('/tasks/' + encodeURIComponent(saved.slug));
            }}
          />`
        : null}
      ${completing ? html`<${LogEntryModal} task=${task} onClose=${() => setCompleting(false)} />` : null}
      ${editingEntry ? html`<${LogEntryModal} entry=${editingEntry} onClose=${() => setEditingEntry(null)} />` : null}
      ${deletingTask
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
        : null}
      ${deletingEntry
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
        : null}
    </div>
  `;
}
