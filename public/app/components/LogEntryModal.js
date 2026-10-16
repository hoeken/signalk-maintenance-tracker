/**
 * Log-entry modal (§7.5): "Mark complete" (creates a log entry for a task),
 * "New log entry" (a standalone entry with a title in place of a task), and
 * editing an existing entry all share this form. On mark-complete the runtime
 * hours are prefilled from the task's current_runtime — which comes from the
 * plugin /tasks API, never from SignalK directly (§8.4).
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import { Modal } from './Modal.js';
import { FormError } from './FormError.js';
import { PlacementAllocator } from './PlacementAllocator.js';
import { FilesField } from './FilesField.js';
import {
  addLog,
  addStandaloneLog,
  updateLog,
  uploadLogFile,
  deleteLogFile,
} from '../api/hooks.js';
import { stockLevel, useStowageItems } from '../api/stowage.js';
import { toDateInput } from '../lib/format.js';
import { amountInput, parseAmount } from '../lib/stats.js';
import { toast } from '../lib/toasts.js';

/** @typedef {import('../types.js').TaskDTO} TaskDTO */
/** @typedef {import('../types.js').LogDTO} LogDTO */

/**
 * `task` (mark complete) or `entry` (edit) drives the mode; with neither the
 * form creates a standalone (non-task) log entry, which carries a title.
 * @param {{ task?: TaskDTO|null, entry?: LogDTO|null, onClose: () => void }} props
 */
export function LogEntryModal(props) {
  const entry = props.entry || null;
  const task = props.task || null;
  const isEdit = !!entry;
  const isStandalone = entry ? entry.task_id === null : !task;
  // Completing a one-off todo archives it; it also has no runtime meter, so
  // the runtime-hours field is dropped.
  const isTodo = !!task && task.is_recurring === false;

  const initialRuntime = isEdit
    ? entry && entry.runtime_hours !== null
      ? String(entry.runtime_hours)
      : ''
    : task &&
        task.current_runtime !== null &&
        task.current_runtime !== undefined
      ? String(Math.round(task.current_runtime * 10) / 10)
      : '';

  const [title, setTitle] = useState(
    isEdit && entry && entry.title ? entry.title : '',
  );
  const [date, setDate] = useState(
    isEdit && entry ? toDateInput(entry.maintenance_date) : toDateInput(),
  );
  const [runtime, setRuntime] = useState(initialRuntime);
  const [notes, setNotes] = useState(
    isEdit && entry && entry.notes ? entry.notes : '',
  );
  // Mark complete starts from the task's estimates; an edit shows what the
  // entry recorded.
  const [actualHours, setActualHours] = useState(
    amountInput(entry ? entry.actual_hours : task && task.estimated_hours),
  );
  const [actualCost, setActualCost] = useState(
    amountInput(entry ? entry.actual_cost : task && task.estimated_cost),
  );
  const hasConsumables =
    !isEdit && !!task && !!task.consumables && task.consumables.length > 0;
  // Per-part overrides of the stock-update defaults, keyed by item_id:
  // `enabled` (the row's checkbox) and `qty` (the raw input text). Anything
  // not touched yet falls back to the defaults derived in stockRows below.
  const [partEdits, setPartEdits] = useState(
    /** @type {Record<string, { enabled?: boolean, qty?: string }>} */ ({}),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Files picked before the entry exists wait here and go up once it has
  // an id (an edit uploads straight to the entry instead).
  const [pendingFiles, setPendingFiles] = useState(/** @type {File[]} */ ([]));
  const [uploading, setUploading] = useState(
    /** @type {{ name: string, fraction: number }|null} */ (null),
  );

  /**
   * The entry is saved by now; a failed upload is reported, not fatal — the
   * person can edit the entry and try again.
   * @param {number} logId
   */
  const uploadPending = async (logId) => {
    for (const file of pendingFiles) {
      setUploading({ name: file.name, fraction: 0 });
      try {
        await uploadLogFile(logId, file, (fraction) =>
          setUploading({ name: file.name, fraction: fraction }),
        );
      } catch (err) {
        toast(
          'Could not upload ' +
            file.name +
            ': ' +
            (err instanceof Error ? err.message : 'upload failed') +
            '. Edit the entry to try again.',
          'error',
        );
      }
    }
    setUploading(null);
  };

  // One row per linked part, checked by default and prefilled with the
  // task's qty_per_service (capped to what's in stock), using the same live
  // item data the picker/badges use. A part with nothing in stock — or that
  // stowage-mgmt no longer has — can't be drawn down, so its row is
  // disabled.
  const itemsRes = useStowageItems();
  const stowageItems = itemsRes.data || [];
  /** @type {import('../types.js').TaskConsumableDTO[]} */
  const consumables = hasConsumables && task ? task.consumables : [];
  const stockRows = consumables.map((c) => {
    const item = stowageItems.find((i) => i.id === c.item_id) || null;
    const available = item ? item.actual_quantity : 0;
    const edit = partEdits[c.item_id] || {};
    const disabled = available <= 0;
    return {
      consumable: c,
      item,
      available,
      disabled,
      enabled: !disabled && edit.enabled !== false,
      qty:
        edit.qty !== undefined
          ? edit.qty
          : String(Math.min(c.qty_per_service, Math.max(available, 0))),
    };
  });
  const enabledRows = stockRows.filter((r) => r.enabled);
  // Split items (across stowage-mgmt locations) need the person to say which
  // location(s) stock came from — stowage-mgmt won't pick one automatically
  // (BoatHacks/signalk-stowage-mgmt#17).
  const splitRows = enabledRows.filter(
    (r) => r.item && r.item.placements.length > 0,
  );

  /**
   * @param {string} itemId
   * @param {{ enabled?: boolean, qty?: string }} patch
   */
  const editPart = (itemId, patch) =>
    setPartEdits(
      (
        /** @type {Record<string, { enabled?: boolean, qty?: string }>} */ prev,
      ) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }),
    );

  /** @type {[Record<string, { allocations: {placement_id: string, quantity: number}[], complete: boolean }>, any]} */
  const [allocationState, setAllocationState] = useState(
    /** @type {Record<string, { allocations: {placement_id: string, quantity: number}[], complete: boolean }>} */ ({}),
  );

  /** @param {Event} e */
  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (isStandalone && !title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!date) {
      setError('Maintenance date is required.');
      return;
    }
    for (const r of enabledRows) {
      const qty = Number(r.qty);
      if (r.qty.trim() === '' || !isFinite(qty) || qty <= 0) {
        setError(
          'Quantity of ' +
            r.consumable.item_name +
            ' used must be a positive number.',
        );
        return;
      }
      if (qty > r.available) {
        setError(
          'Only ' +
            r.available +
            ' ' +
            r.consumable.item_name +
            ' in stock — lower the quantity used.',
        );
        return;
      }
    }
    const incomplete = splitRows.find(
      (r) => !allocationState[r.consumable.item_id]?.complete,
    );
    if (incomplete) {
      setError(
        'Pick a location for all of the ' +
          incomplete.consumable.item_name +
          ' used before marking this complete.',
      );
      return;
    }
    /** @type {import('../types.js').LogInput} */
    const input = {
      maintenance_date: date,
      notes: notes.trim() ? notes : null,
      runtime_hours: null,
    };
    if (isStandalone) input.title = title.trim();
    const hours = parseAmount(actualHours);
    if (hours === undefined) {
      setError('Actual time must be 0 or a positive number of hours.');
      return;
    }
    input.actual_hours = hours;
    const cost = parseAmount(actualCost);
    if (cost === undefined) {
      setError('Actual cost must be 0 or a positive number.');
      return;
    }
    input.actual_cost = cost;
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
        if (hasConsumables) {
          input.consume_stock = enabledRows.length > 0;
          if (enabledRows.length) {
            input.consumable_quantities = enabledRows.map((r) => ({
              item_id: r.consumable.item_id,
              quantity: Number(r.qty),
            }));
          }
          if (splitRows.length) {
            input.consumable_allocations = splitRows.map((r) => ({
              item_id: r.consumable.item_id,
              placements: allocationState[r.consumable.item_id].allocations,
            }));
          }
        }
        const created = await addLog(task.slug, input);
        toast(
          isTodo
            ? 'Completed "' + task.name + '" — moved to archive.'
            : 'Marked "' + task.name + '" complete.',
          'success',
        );
        if (created.consumable_warnings && created.consumable_warnings.length) {
          toast(
            'Stock not fully updated: ' +
              created.consumable_warnings.join('; '),
            'error',
          );
        }
        await uploadPending(created.id);
      } else {
        const created = await addStandaloneLog(input);
        toast('Log entry added.', 'success');
        await uploadPending(created.id);
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
      ${
        busy
          ? uploading
            ? 'Uploading…'
            : 'Saving…'
          : isEdit
            ? 'Save changes'
            : task
              ? 'Complete'
              : 'Add entry'
      }
    </button>
  `;

  const modalTitle = isEdit
    ? 'Edit log entry'
    : task
      ? 'Complete — ' + task.name
      : 'New log entry';

  return html`
    <${Modal} title=${modalTitle} onClose=${props.onClose} footer=${footer}>
      <form id="log-form" onSubmit=${onSubmit}>
        <${FormError} message=${error} />
        ${
          isStandalone && !isEdit
            ? html`<p class="field-hint" style="margin:0 0 12px">
                For quick log entries not tied to any task. For better
                record-keeping, use${' '}
                <strong>Complete</strong> on an existing task.
              </p>`
            : null
        }

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

        ${
          isStandalone
            ? html`<div class="field">
                <label class="field-label" for="log-title">Title</label>
                <input
                  id="log-title"
                  class="input"
                  type="text"
                  value=${title}
                  onInput=${(/** @type {any} */ e) => setTitle(e.currentTarget.value)}
                />
              </div>`
            : null
        }

        ${
          // Standalone entries and todos aren't tied to anything with a
          // runtime meter.
          !isStandalone && !isTodo
            ? html`<div class="field">
                <label class="field-label" for="log-runtime">
                  Runtime hours
                </label>
                <input
                  id="log-runtime"
                  class="input"
                  type="number"
                  min="0"
                  step="any"
                  value=${runtime}
                  onInput=${(/** @type {any} */ e) => setRuntime(e.currentTarget.value)}
                />
              </div>`
            : null
        }

        <div class="field-row">
          <div class="field">
            <label class="field-label" for="log-actual-hours"
              >Actual time (hours)</label
            >
            <input
              id="log-actual-hours"
              class="input"
              type="number"
              min="0"
              step="any"
              value=${actualHours}
              onInput=${(/** @type {any} */ e) => setActualHours(e.currentTarget.value)}
            />
          </div>
          <div class="field">
            <label class="field-label" for="log-actual-cost"
              >Actual cost ($)</label
            >
            <input
              id="log-actual-cost"
              class="input"
              type="number"
              min="0"
              step="any"
              value=${actualCost}
              onInput=${(/** @type {any} */ e) => setActualCost(e.currentTarget.value)}
            />
          </div>
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

        <div class="field">
          <label class="field-label">Files</label>
          ${
            isEdit && entry
              ? html`<${FilesField}
                  id="log-files-input"
                  files=${entry.files || []}
                  upload=${(
                    /** @type {File} */ file,
                    /** @type {(fraction: number) => void} */ onProgress,
                  ) => uploadLogFile(entry.id, file, onProgress)}
                  remove=${(/** @type {import('../types.js').FileDTO} */ f) =>
                    deleteLogFile(entry.id, f.id)}
                  hint="Photos of the work, receipts — any type, up to 1 GB each. Uploads and deletions apply immediately."
                />`
              : html`<${FilesField}
                  id="log-files-input"
                  pending=${pendingFiles}
                  onPendingChange=${setPendingFiles}
                  uploading=${uploading}
                  disabled=${busy}
                  hint="Photos of the work, receipts — any type, up to 1 GB each. Uploaded when the entry is saved."
                />`
          }
        </div>

        ${
          hasConsumables
            ? html`<div class="field">
                <label class="field-label">Inventory Management</label>
                <div class="field-hint" style="margin:0 0 6px">
                  Tick the parts used to update their signalk-stowage-mgmt
                  stock.
                </div>
                <ul class="consumables-list log-parts">
                  ${stockRows.map((r) => {
                    const id = 'log-part-' + r.consumable.item_id;
                    return html`<li key=${r.consumable.item_id}>
                      <div class="consumables-row">
                        <input
                          id=${id}
                          type="checkbox"
                          checked=${r.enabled}
                          disabled=${r.disabled}
                          onInput=${(/** @type {any} */ e) =>
                            editPart(r.consumable.item_id, {
                              enabled: e.currentTarget.checked,
                            })}
                        />
                        <input
                          class="input consumables-qty"
                          type="number"
                          min="0"
                          max=${r.available}
                          step="any"
                          aria-label=${'Quantity of ' + r.consumable.item_name + ' used'}
                          value=${r.qty}
                          disabled=${!r.enabled}
                          onInput=${(/** @type {any} */ e) =>
                            editPart(r.consumable.item_id, {
                              qty: e.currentTarget.value,
                            })}
                        />
                        <span class="consumables-total">
                          /${' '}${
                            r.item
                              ? html`<span
                                  class=${
                                    'consumables-stock ' +
                                    stockLevel(
                                      r.item,
                                      r.consumable.qty_per_service,
                                    )
                                  }
                                  >${r.available}</span
                                >`
                              : itemsRes.loading
                                ? '…'
                                : '?'
                          }
                        </span>
                        <label class="consumables-name" for=${id}>
                          ${r.consumable.item_name}
                        </label>
                      </div>
                      ${
                        r.enabled && Number(r.qty) > r.available
                          ? html`<div class="field-error">
                              Only ${r.available} in stock.
                            </div>`
                          : !r.item && !itemsRes.loading
                            ? html`<div class="field-hint">
                                Not found in signalk-stowage-mgmt.
                              </div>`
                            : null
                      }
                    </li>`;
                  })}
                </ul>
              </div>`
            : null
        }
        ${splitRows.map((r) => {
          const required = Number(r.qty);
          return isFinite(required) && required > 0 && required <= r.available
            ? html`<${PlacementAllocator}
                key=${r.consumable.item_id}
                itemName=${r.consumable.item_name}
                required=${required}
                placements=${/** @type {any} */ (r.item).placements}
                onChange=${(
                  /** @type {{placement_id: string, quantity: number}[]} */ allocations,
                  /** @type {boolean} */ complete,
                ) =>
                  setAllocationState(
                    (
                      /** @type {Record<string, { allocations: {placement_id: string, quantity: number}[], complete: boolean }>} */ prev,
                    ) => ({
                      ...prev,
                      [r.consumable.item_id]: { allocations, complete },
                    }),
                  )}
              />`
            : null;
        })}
      </form>
    <//>
  `;
}
