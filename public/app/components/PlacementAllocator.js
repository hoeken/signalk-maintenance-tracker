/**
 * Location picker for consuming a split stowage-mgmt item on task
 * completion (docs/inventory-interaction.md). One location field appears;
 * the person picks a location and the needed quantity is drawn from it
 * automatically (capped to what's there). If that doesn't cover the full
 * amount needed, another location field appears automatically for the
 * remainder, and so on until fully allocated. stowage-mgmt's maintainer
 * deliberately rejected an endpoint that picks a location automatically
 * (BoatHacks/signalk-stowage-mgmt#17) — a person has to make this call.
 *
 * Emits the derived {placement_id, quantity}[] allocation via onChange
 * whenever the selection changes; the quantity per row is never directly
 * editable — it's always "however much of what's still needed fits here".
 */
import { html } from '../lib/html.js';
import { useEffect, useState } from '../../vendor/preact-hooks.js';

/** @typedef {import('../api/stowage.js').StowagePlacement} StowagePlacement */
/** @typedef {{ placement_id: string, quantity: number }} PlacementAllocation */

/**
 * Derive each row's actual allocation from the ordered location picks: row
 * N gets min(remaining after rows before it, that placement's quantity).
 * @param {(string|null)[]} picks
 * @param {number} required
 * @param {StowagePlacement[]} placements
 * @returns {{ picks: (string|null)[], allocations: PlacementAllocation[], remaining: number, exhausted: boolean }}
 */
function derive(picks, required, placements) {
  const byId = new Map(placements.map((p) => [p.id, p]));
  let remaining = required;
  /** @type {PlacementAllocation[]} */
  const allocations = [];
  for (const pick of picks) {
    if (!pick || remaining <= 0) continue;
    const placement = byId.get(pick);
    if (!placement) continue;
    const take = Math.min(remaining, placement.quantity);
    if (take > 0) allocations.push({ placement_id: pick, quantity: take });
    remaining -= take;
  }
  const pickedIds = new Set(picks.filter(Boolean));
  const exhausted =
    remaining > 0 &&
    placements.every((p) => pickedIds.has(p.id) || p.quantity <= 0);
  return { picks, allocations, remaining, exhausted };
}

/**
 * @param {{
 *   itemName: string,
 *   required: number,
 *   placements: StowagePlacement[],
 *   onChange: (allocations: PlacementAllocation[], complete: boolean) => void,
 * }} props
 */
export function PlacementAllocator(props) {
  const { itemName, required, placements } = props;
  const [picks, setPicks] = useState(/** @type {(string|null)[]} */ ([null]));

  const { allocations, remaining, exhausted } = derive(
    picks,
    required,
    placements,
  );

  // Auto-append a new empty row once the current picks don't cover the full
  // amount and there's still an unused placement with stock left to try.
  useEffect(() => {
    if (remaining > 0 && !exhausted && picks[picks.length - 1] !== null) {
      setPicks(picks.concat([null]));
    }
  }, [remaining, exhausted, picks.length]);

  useEffect(() => {
    props.onChange(allocations, remaining <= 0);
    // Re-run whenever the derived allocation actually changes.
  }, [JSON.stringify(allocations), remaining <= 0]);

  /**
   * @param {number} index
   * @param {string} value
   */
  const setPick = (index, value) => {
    const next = picks.slice();
    next[index] = value || null;
    setPicks(next);
  };

  /** @param {number} index */
  const removeRow = (index) => {
    const next = picks.slice();
    next.splice(index, 1);
    setPicks(next.length ? next : [null]);
  };

  const pickedElsewhere = (/** @type {number} */ index) =>
    new Set(picks.filter((p, i) => p && i !== index));

  return html`
    <div class="field">
      <label class="field-label"
        >Where did the ${required} × ${itemName} come from?</label
      >
      ${picks.map((pick, index) => {
        const exclude = pickedElsewhere(index);
        const options = placements.filter(
          (p) => p.id === pick || (!exclude.has(p.id) && p.quantity > 0),
        );
        return html`<div key=${index} class="consumables-row">
          <select
            class="select"
            aria-label=${'Location ' + (index + 1) + ' for ' + itemName}
            value=${pick || ''}
            onInput=${(/** @type {any} */ e) =>
              setPick(index, e.currentTarget.value)}
          >
            <option value="">Select a location…</option>
            ${options.map(
              (p) =>
                html`<option key=${p.id} value=${p.id}>
                  ${p.location_name || 'Unspecified location'} (${p.quantity} available)
                </option>`,
            )}
          </select>
          ${
            picks.length > 1
              ? html`<button
                  type="button"
                  class="btn-icon danger"
                  aria-label=${'Remove location ' + (index + 1)}
                  title="Remove"
                  onClick=${() => removeRow(index)}
                >
                  <i class="bi bi-x" />
                </button>`
              : null
          }
        </div>`;
      })}
      ${
        remaining > 0
          ? html`<div class="field-error">
              ${
                exhausted
                  ? 'Not enough stock across known locations to cover this amount.'
                  : remaining + ' still needs a location.'
              }
            </div>`
          : html`<div class="field-hint">Fully allocated.</div>`
      }
    </div>
  `;
}
