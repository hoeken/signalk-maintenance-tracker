/**
 * Hand-rolled data table (§7.4): column definitions, header sorting,
 * empty/loading states. Pagination is a sibling component.
 */
import { html } from '../lib/html.js';

/**
 * @typedef {Object} Column
 * @property {string} key row field, and the `sort` value for sortable columns
 * @property {string} label
 * @property {boolean} [sortable]
 * @property {string} [className]
 * @property {(row: any) => any} [render]
 */

/**
 * @param {{
 *   columns: Column[],
 *   rows: any[],
 *   rowKey?: (row: any) => string|number,
 *   sort?: string,
 *   order?: string,
 *   onSort?: (key: string) => void,
 *   loading?: boolean,
 *   emptyMessage?: string,
 *   renderDetail?: (row: any) => any,
 * }} props
 */
export function Table(props) {
  const rows = props.rows || [];
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            ${props.columns.map((col) => headerCell(col, props))}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const key = props.rowKey ? props.rowKey(row) : row.id;
            const detail = props.renderDetail ? props.renderDetail(row) : null;
            return html`
              <tr key=${key} class=${detail ? 'has-detail' : ''}>
                ${props.columns.map(
                  (col) => html`<td class=${col.className || ''}>${col.render ? col.render(row) : row[col.key]}</td>`
                )}
              </tr>
              ${detail
                ? html`<tr key=${key + ':detail'} class="detail-row">
                    <td colspan=${props.columns.length}>${detail}</td>
                  </tr>`
                : null}
            `;
          })}
        </tbody>
      </table>
      ${rows.length === 0
        ? html`<div class=${props.loading ? 'table-loading' : 'table-empty'}>
            ${props.loading ? 'Loading…' : props.emptyMessage || 'Nothing here yet.'}
          </div>`
        : null}
    </div>
  `;
}

/**
 * @param {Column} col
 * @param {{ sort?: string, order?: string, onSort?: (key: string) => void }} props
 */
function headerCell(col, props) {
  const sortable = !!col.sortable && !!props.onSort;
  const active = sortable && props.sort === col.key;
  const icon = active
    ? html`<i class=${'bi ' + (props.order === 'desc' ? 'bi-caret-down-fill' : 'bi-caret-up-fill')} />`
    : null;
  const onClick = sortable && props.onSort ? () => props.onSort && props.onSort(col.key) : undefined;
  return html`
    <th
      class=${(col.className || '') + (sortable ? ' sortable' : '')}
      onClick=${onClick}
      aria-sort=${active ? (props.order === 'desc' ? 'descending' : 'ascending') : undefined}
    >
      ${col.label}${icon}
    </th>
  `;
}
