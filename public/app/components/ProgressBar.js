import { html } from '../lib/html.js';

/**
 * CSS progress bar for runtime_fraction / time_fraction (§7.4).
 * @param {{ fraction: number|null, status?: string|null }} props
 */
export function ProgressBar(props) {
  if (props.fraction === null || props.fraction === undefined) return null;
  const pct = Math.round(Math.min(1, Math.max(0, props.fraction)) * 100);
  const cls = 'progress-fill' + (props.status === 'overdue' || props.status === 'due_soon' ? ' ' + props.status : '');
  return html`
    <div class="progress" role="progressbar" aria-valuenow=${pct} aria-valuemin="0" aria-valuemax="100">
      <div class=${cls} style=${'width:' + pct + '%'} />
    </div>
  `;
}
