import { html } from '../lib/html.js';

/**
 * @param {{ page: number, pageSize: number, total: number, onPage: (page: number) => void }} props
 */
export function Pagination(props) {
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  if (props.total === 0) return null;
  const first = (props.page - 1) * props.pageSize + 1;
  const last = Math.min(props.total, props.page * props.pageSize);
  return html`
    <div class="pagination">
      <span>${first}–${last} of ${props.total}</span>
      <button
        type="button"
        class="btn-icon"
        aria-label="Previous page"
        disabled=${props.page <= 1}
        onClick=${() => props.onPage(props.page - 1)}
      >
        <i class="bi bi-chevron-left" />
      </button>
      <span>${props.page} / ${pages}</span>
      <button
        type="button"
        class="btn-icon"
        aria-label="Next page"
        disabled=${props.page >= pages}
        onClick=${() => props.onPage(props.page + 1)}
      >
        <i class="bi bi-chevron-right" />
      </button>
    </div>
  `;
}
