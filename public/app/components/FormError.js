/**
 * Form-level error banner for modals. Long forms (e.g. the task editor) put
 * the banner above the fold, so when submit fails from the footer button the
 * message would be invisible — this scrolls itself into view whenever the
 * message appears or changes.
 */
import { html } from '../lib/html.js';
import { useEffect, useRef } from '../../vendor/preact-hooks.js';

/**
 * @param {{ message: string }} props
 */
export function FormError(props) {
  /** @type {{ current: HTMLElement|null }} */
  const ref = useRef(null);

  useEffect(() => {
    if (props.message && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [props.message]);

  if (!props.message) return null;
  return html`<div class="form-error" role="alert" ref=${ref}>
    ${props.message}
  </div>`;
}
