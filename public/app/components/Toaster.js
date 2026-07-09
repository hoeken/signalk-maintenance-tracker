import { html } from '../lib/html.js';
import { toasts, dismissToast } from '../lib/toasts.js';

/** Renders the toast queue (§7.2); click a toast to dismiss it. */
export function Toaster() {
  const items = toasts.value;
  if (!items.length) return null;
  return html`
    <div class="toaster">
      ${items.map(
        (t) => html`
          <div key=${t.id} class=${'toast ' + t.kind} role="status" onClick=${() => dismissToast(t.id)}>
            ${t.message}
          </div>
        `
      )}
    </div>
  `;
}
