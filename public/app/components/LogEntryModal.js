/**
 * Log-entry modal (§7.5): "Mark complete" (creates a log entry for a task)
 * and editing an existing entry share this form. On create the runtime hours
 * are prefilled from the task's current_runtime — which comes from the plugin
 * /tasks API, never from SignalK directly (§8.4).
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import { Modal } from './Modal.js';
import { PlacementAllocator } from './PlacementAllocator.js';
import { addLog, updateLog } from '../api/hooks.js';
import { useStowageItems } from '../api/stowage.js';
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
  const hasConsumables =
    !isEdit && !!task && !!task.consumables && task.consumables.length > 0;
  const [consumeStock, setConsumeStock] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Split items (across stowage-mgmt locations) need the person to say which
  // location(s) stock came from — stowage-mgmt won't pick one automatically
  // (BoatHacks/signalk-stowage-mgmt#17). Figure out which of this task's
  // linked consumables are currently split, using the same live item data
  // the picker/badges use.
  const itemsRes = useStowageItems();
  const stowageItems = itemsRes.data || [];
  /** @type {import('../types.js').TaskConsumableDTO[]} */
  const consumables = hasConsumables && task ? task.consumables : [];
  const splitConsumables = consumables
    .map((c) => ({
      consumable: c,
      item: stowageItems.find((i) => i.id === c.item_id),
    }))
    .filter((x) => x.item && x.item.placements.length > 0);

  /** @type {[Record<string, { allocations: {placement_id: string, quantity: number}[], complete: boolean }>, any]} */
  const [allocationState, setAllocationState] = useState(
    /** @type {Record<string, { allocations: {placement_id: string, quantity: number}[], complete: boolean }>} */ ({}),
  );

  /** @param {Event} e */
  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!date) {
      setError('Maintenance date is required.');
      return;
    }
    if (hasConsumables && consumeStock) {
      const incomplete = splitConsumables.find(
        (x) => !allocationState[x.consumable.item_id]?.complete,
      );
      if (incomplete) {
        setError(
          'Pick a location for all of the ' +
            incomplete.consumable.item_name +
            ' used before marking this complete.',
        );
        return;
      }
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
        if (hasConsumables) {
          input.consume_stock = consumeStock;
          if (consumeStock && splitConsumables.length) {
            input.consumable_allocations = splitConsumables.map((x) => ({
              item_id: x.consumable.item_id,
              placements: allocationState[x.consumable.item_id].allocations,
            }));
          }
        }
        const created = await addLog(task.slug, input);
        toast('Marked "' + task.name + '" complete.', 'success');
        if (created.consumable_warnings && created.consumable_warnings.length) {
          toast(
            'Stock not fully updated: ' +
              created.consumable_warnings.join('; '),
            'error',
          );
        }
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

        ${
          hasConsumables
            ? html`<div class="field">
                <label class="field-label" for="log-consume-stock">
                  <input
                    id="log-consume-stock"
                    type="checkbox"
                    checked=${consumeStock}
                    onInput=${(/** @type {any} */ e) =>
                      setConsumeStock(e.currentTarget.checked)}
                  />
                  ${' '}Update signalk-stowage-mgmt stock for this task's
                  linked parts
                </label>
              </div>`
            : null
        }
        ${
          hasConsumables && consumeStock && splitConsumables.length
            ? splitConsumables.map(
                (x) => html`<${PlacementAllocator}
                  key=${x.consumable.item_id}
                  itemName=${x.consumable.item_name}
                  required=${x.consumable.qty_per_service}
                  placements=${/** @type {any} */ (x.item).placements}
                  onChange=${(
                    /** @type {{placement_id: string, quantity: number}[]} */ allocations,
                    /** @type {boolean} */ complete,
                  ) =>
                    setAllocationState(
                      (
                        /** @type {Record<string, { allocations: {placement_id: string, quantity: number}[], complete: boolean }>} */ prev,
                      ) => ({
                        ...prev,
                        [x.consumable.item_id]: { allocations, complete },
                      }),
                    )}
                />`,
              )
            : null
        }
      </form>
    <//>
  `;
}
