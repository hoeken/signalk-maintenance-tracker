/**
 * The single place raw HTML is set (§7.8): markdown → snarkdown → sanitize →
 * dangerouslySetInnerHTML. Nothing else may set raw HTML.
 */
import snarkdown from '../../vendor/snarkdown.js';
import { html } from '../lib/html.js';
import { sanitizeHtml } from '../lib/sanitize.js';

/** @param {{ markdown: string|null|undefined }} props */
export function MarkdownView(props) {
  if (!props.markdown) return null;
  const clean = sanitizeHtml(snarkdown(props.markdown));
  return html`<div class="markdown" dangerouslySetInnerHTML=${{ __html: clean }} />`;
}
