/**
 * "Parts used" picker for the task editor (docs/inventory-interaction.md):
 * search-and-add combo over signalk-stowage-mgmt items, a qty-per-service
 * input per linked item, and remove buttons. Mirrors TagInput's shape
 * (chips + combo) but each "chip" also carries an editable quantity.
 *
 * Read-only by design if stowage-mgmt is unreachable: existing links can
 * still be viewed/removed/re-quantified (they're just cached name + id, no
 * live dependency), but adding new ones needs the live item list.
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import { useStowageItems, StowageUnavailableError } from '../api/stowage.js';

/** @typedef {import('../types.js').TaskConsumableDTO} TaskConsumableDTO */

/**
 * @param {{ value: TaskConsumableDTO[], onChange: (items: TaskConsumableDTO[]) => void }} props
 */
export function ConsumablesPicker(props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  const selected = props.value || [];
  const selectedIds = selected.map((c) => c.item_id);

  const itemsRes = useStowageItems();
  const items = itemsRes.data || [];
  const unavailable = itemsRes.error instanceof StowageUnavailableError;

  const matches = items
    .filter((i) => selectedIds.indexOf(i.id) === -1)
    .filter(
      (i) => !text || i.name.toLowerCase().indexOf(text.toLowerCase()) !== -1,
    )
    .slice(0, 8);

  /** @param {import('../api/stowage.js').StowageItem} item */
  const add = (item) => {
    props.onChange(
      selected.concat([
        { item_id: item.id, item_name: item.name, qty_per_service: 1 },
      ]),
    );
    setText('');
    setOpen(false);
  };

  /** @param {string} itemId */
  const remove = (itemId) => {
    props.onChange(selected.filter((c) => c.item_id !== itemId));
  };

  /**
   * @param {string} itemId
   * @param {string} raw
   */
  const setQty = (itemId, raw) => {
    const qty = Number(raw);
    props.onChange(
      selected.map((c) =>
        c.item_id === itemId
          ? { ...c, qty_per_service: isFinite(qty) ? qty : c.qty_per_service }
          : c,
      ),
    );
  };

  return html`
    <div>
      ${
        selected.length
          ? html`<ul class="consumables-list">
              ${selected.map(
                (c) => html`
                  <li key=${c.item_id} class="consumables-row">
                    <span class="consumables-name">${c.item_name}</span>
                    <input
                      class="input consumables-qty"
                      type="number"
                      min="0"
                      step="any"
                      aria-label=${'Quantity per service for ' + c.item_name}
                      value=${String(c.qty_per_service)}
                      onInput=${(/** @type {any} */ e) =>
                        setQty(c.item_id, e.currentTarget.value)}
                    />
                    <button
                      type="button"
                      class="btn-icon danger"
                      aria-label=${'Remove ' + c.item_name}
                      title="Remove"
                      onClick=${() => remove(c.item_id)}
                    >
                      <i class="bi bi-x" />
                    </button>
                  </li>
                `,
              )}
            </ul>`
          : null
      }
      ${
        unavailable
          ? html`<div class="field-hint">
              Could not reach signalk-stowage-mgmt — existing parts above can
              still be edited or removed, but new ones can't be added right
              now.
            </div>`
          : html`<div class="combo">
              <input
                class="input"
                placeholder="Search stowage-mgmt items to add"
                value=${text}
                onInput=${(/** @type {any} */ e) => {
                  setText(e.currentTarget.value);
                  setOpen(true);
                }}
                onFocus=${() => setOpen(true)}
                onBlur=${() => setTimeout(() => setOpen(false), 150)}
              />
              ${
                open && matches.length
                  ? html`<ul class="combo-list">
                      ${matches.map(
                        (i) =>
                          html`<li
                            key=${i.id}
                            onMouseDown=${() => add(i)}
                          >
                            ${i.name}
                          </li>`,
                      )}
                    </ul>`
                  : null
              }
            </div>`
      }
    </div>
  `;
}
