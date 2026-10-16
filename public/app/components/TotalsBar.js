import { html } from '../lib/html.js';
import { formatCost, formatWorkHours } from '../lib/format.js';

/** @typedef {import('../types.js').Aggregate} Aggregate */
/** @typedef {{ label: string, value: string|null }} TotalsItem */

/**
 * A "Statistics" section of label/value figures summarising a list, shown
 * under its table, with a note on what they cover. Items whose value is null
 * are dropped, and with none left nothing renders — so lists nobody records
 * hours or costs on stay as they were.
 *
 * @param {{ items: TotalsItem[], note?: string }} props
 */
export function TotalsBar(props) {
  const items = props.items.filter((i) => i.value !== null);
  if (!items.length) return null;
  return html`
    <section class="totals">
      <h2 class="totals-title">Statistics</h2>
      <div class="totals-bar">
        ${items.map(
          (i) => html`
            <span key=${i.label} class="totals-item">
              <span class="muted">${i.label}</span>${' '}<strong
                >${i.value}</strong
              >
            </span>
          `,
        )}
      </div>
      ${props.note ? html`<div class="field-hint">${props.note}</div>` : null}
    </section>
  `;
}

/**
 * "1 task" / "3 tasks".
 * @param {number} n
 * @param {string} singular
 * @param {string} plural
 */
export function countOf(n, singular, plural) {
  return n + ' ' + (n === 1 ? singular : plural);
}

/**
 * An aggregate's total, formatted — null when nothing was recorded.
 * @param {Aggregate} a
 * @param {'hours'|'cost'} kind
 */
export function totalOf(a, kind) {
  if (!a.count) return null;
  return kind === 'hours' ? formatWorkHours(a.total) : formatCost(a.total);
}

/**
 * An aggregate's average, formatted — null when nothing was recorded.
 * @param {Aggregate} a
 * @param {'hours'|'cost'} kind
 */
export function averageOf(a, kind) {
  if (a.average === null) return null;
  return kind === 'hours' ? formatWorkHours(a.average) : formatCost(a.average);
}
