/**
 * The single place raw HTML is set (§7.8): mark blank lines → snarkdown →
 * sanitize → autolink → soft breaks → dangerouslySetInnerHTML. Nothing else may
 * set raw HTML.
 */
import snarkdown from '../../vendor/snarkdown.js';
import { autolinkHtml } from '../lib/autolink.js';
import { html } from '../lib/html.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import { keepBlankLines, softBreakHtml } from '../lib/softbreak.js';

/** @param {{ markdown: string|null|undefined }} props */
export function MarkdownView(props) {
  if (!props.markdown) return null;
  const rendered = snarkdown(keepBlankLines(props.markdown));
  const clean = softBreakHtml(autolinkHtml(sanitizeHtml(rendered)));
  return html`<div
    class="markdown"
    dangerouslySetInnerHTML=${{ __html: clean }}
  />`;
}
