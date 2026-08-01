import { html } from '../lib/html.js';

/**
 * Label/value readout for the task detail page's Schedule and Runtime cards
 * (§7.4). Rows whose value is null are dropped, so a caller can list every
 * field its dimension could have and let the inapplicable ones fall away.
 *
 * @param {{ rows: { label: string, value: any }[] }} props
 */
export function StatTable(props) {
  const rows = props.rows.filter((r) => r.value !== null);
  if (!rows.length) return null;
  return html`
    <table class="stat-table">
      <tbody>
        ${rows.map(
          (r) => html`
            <tr key=${r.label}>
              <th scope="row">${r.label}</th>
              <td>${r.value}</td>
            </tr>
          `,
        )}
      </tbody>
    </table>
  `;
}
