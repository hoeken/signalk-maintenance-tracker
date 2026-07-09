/**
 * Shared modal primitive (§7.5): overlay, Escape-to-close, focus trap,
 * role="dialog". Every modal in the app builds on this.
 */
import { html } from '../lib/html.js';
import { useEffect, useRef } from '../../vendor/preact-hooks.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * @param {{ title: string, onClose: () => void, children?: any, footer?: any, narrow?: boolean }} props
 */
export function Modal(props) {
  /** @type {{ current: HTMLElement|null }} */
  const ref = useRef(null);

  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    const node = ref.current;
    if (node) {
      const first = node.querySelector(FOCUSABLE);
      if (first && first instanceof HTMLElement) first.focus();
    }
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /** @param {KeyboardEvent} e */
  const trapTab = (e) => {
    if (e.key !== 'Tab') return;
    const node = ref.current;
    if (!node) return;
    const focusables = node.querySelectorAll(FOCUSABLE);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (
      e.shiftKey &&
      document.activeElement === first &&
      last instanceof HTMLElement
    ) {
      e.preventDefault();
      last.focus();
    } else if (
      !e.shiftKey &&
      document.activeElement === last &&
      first instanceof HTMLElement
    ) {
      e.preventDefault();
      first.focus();
    }
  };

  /** @param {MouseEvent} e */
  const onOverlayDown = (e) => {
    if (e.target === e.currentTarget) props.onClose();
  };

  return html`
    <div class="modal-overlay" onMouseDown=${onOverlayDown}>
      <div
        class=${'modal' + (props.narrow ? ' narrow' : '')}
        role="dialog"
        aria-modal="true"
        aria-label=${props.title}
        ref=${ref}
        onKeyDown=${trapTab}
      >
        <div class="modal-header">
          <h2 class="modal-title">${props.title}</h2>
          <button
            type="button"
            class="btn-icon"
            aria-label="Close"
            onClick=${props.onClose}
          >
            <i class="bi bi-x-lg" />
          </button>
        </div>
        <div class="modal-body">${props.children}</div>
        ${props.footer ? html`<div class="modal-footer">${props.footer}</div>` : null}
      </div>
    </div>
  `;
}
