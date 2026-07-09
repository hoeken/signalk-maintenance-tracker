import { html } from '../lib/html.js';
import { statusLabel } from '../lib/format.js';

/** @param {{ status: import('../types.js').Status }} props */
export function StatusBadge(props) {
  return html`<span class=${'badge ' + props.status}>${statusLabel(props.status)}</span>`;
}
