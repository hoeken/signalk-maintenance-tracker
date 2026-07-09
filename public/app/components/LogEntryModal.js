/**
 * Log-entry modal (§7.5): "Mark complete" (creates a log entry for a task)
 * and editing an existing entry share this form. On create the runtime hours
 * are prefilled from the task's current_runtime — which comes from the plugin
 * /tasks API, never from SignalK directly (§8.4).
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import { Modal } from './Modal.js';
import { addLog, updateLog } from '../api/hooks.js';
import { toDateInput } from '../lib/format.js';
import { toast } from '../lib/toasts.js';

/** @typedef {import('../types.js').TaskDTO} TaskDTO */
/** @typedef {import('../types.js').LogDTO} LogDTO */

/**
 * Exactly one of `task` (mark complete) or `entry` (edit) drives the mode.
 * @param {{ task?: TaskDTO|null, entry?: LogDTO|null, onClose: () => void }} props
 */
export function LogEntryModal(props) {
  const entry = props.entry || null;
  const task = props.task || null;
  const isEdit = !!entry;

  const initialRuntime = isEdit
    ? entry && entry.runtime_hours !== null
      ? String(entry.runtime_hours)
      : ''
    : task &&
        task.current_runtime !== null &&
        task.current_runtime !== undefined
      ? String(Math.round(task.current_runtime * 10) / 10)
      : '';

  const [date, setDate] = useState(
    isEdit && entry ? toDateInput(entry.maintenance_date) : toDateInput(),
  );
  const [runtime, setRuntime] = useState(initialRuntime);
  const [notes, setNotes] = useState(
    isEdit && entry && entry.notes ? entry.notes : '',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /** @param {Event} e */
  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!date) {
      setError('Maintenance date is required.');
      return;
    }
    /** @type {import('../types.js').LogInput} */
    const input = {
      maintenance_date: date,
      notes: notes.trim() ? notes : null,
      runtime_hours: null,
    };
    if (runtime.trim() !== '') {
      const hours = Number(runtime);
      if (!isFinite(hours) || hours < 0) {
        setError('Runtime hours must be a non-negative number.');
        return;
      }
      input.runtime_hours = hours;
    }
    setBusy(true);
    try {
      if (isEdit && entry) {
        await updateLog(entry.id, input);
        toast('Log entry updated.', 'success');
      } else if (task) {
        await addLog(task.slug, input);
        toast('Marked "' + task.name + '" complete.', 'success');
      }
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
    }
  };

  const footer = html`
    <button type="button" class="btn" onClick=${props.onClose} disabled=${busy}>
      Cancel
    </button>
    <button
      type="submit"
      form="log-form"
      class="btn btn-primary"
      disabled=${busy}
    >
      ${busy ? 'Saving…' : isEdit ? 'Save changes' : 'Mark complete'}
    </button>
  `;

  const title = isEdit
    ? 'Edit log entry'
    : 'Mark complete' + (task ? ' — ' + task.name : '');

  return html`
    <${Modal} title=${title} onClose=${props.onClose} footer=${footer}>
      <form id="log-form" onSubmit=${onSubmit}>
        ${error ? html`<div class="form-error">${error}</div>` : null}

        <div class="field">
          <label class="field-label" for="log-date">Maintenance date</label>
          <input
            id="log-date"
            class="input"
            type="date"
            value=${date}
            onInput=${(/** @type {any} */ e) => setDate(e.currentTarget.value)}
          />
        </div>

        <div class="field">
          <label class="field-label" for="log-runtime">Runtime hours</label>
          <input
            id="log-runtime"
            class="input"
            type="number"
            min="0"
            step="any"
            value=${runtime}
            onInput=${(/** @type {any} */ e) => setRuntime(e.currentTarget.value)}
          />
          ${
            !isEdit
              ? html`<div class="field-hint">
                  Prefilled with the current runtime reading when available.
                </div>`
              : null
          }
        </div>

        <div class="field">
          <label class="field-label" for="log-notes">Notes (markdown)</label>
          <textarea
            id="log-notes"
            class="textarea"
            value=${notes}
            onInput=${(/** @type {any} */ e) => setNotes(e.currentTarget.value)}
          />
        </div>
      </form>
    <//>
  `;
}
