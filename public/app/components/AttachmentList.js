/**
 * The two ways attachments are shown — documents as a named list, images as
 * a thumbnail grid — shared by the task detail page and the log-entry
 * attachments modal. The caller supplies the headings and `urlFor`, which
 * maps a file to its download URL on whichever owner it belongs to.
 */
import { html } from '../lib/html.js';
import { formatBytes } from '../lib/format.js';
import { isInlineType } from '../lib/files.js';

/** @typedef {import('../types.js').FileDTO} FileDTO */

/**
 * Documents by name and size. What the browser can show (PDFs, text, media)
 * opens in a tab; everything else is a plain download.
 * @param {{ files: FileDTO[], urlFor: (file: FileDTO) => string }} props
 */
export function FileList(props) {
  return html`<ul class="files-list">
    ${props.files.map(
      (f) => html`<li key=${f.id} class="files-row">
        <span class="files-name"
          ><a
            href=${props.urlFor(f)}
            ...${
              isInlineType(f.mime)
                ? { target: '_blank', rel: 'noopener' }
                : { download: f.name }
            }
            ><i class="bi bi-paperclip" />${f.name}</a
          ></span
        >
        <span class="files-size">${formatBytes(f.size)}</span>
      </li>`,
    )}
  </ul>`;
}

/**
 * Image thumbnails, each opening the full image in a tab.
 * @param {{ files: FileDTO[], urlFor: (file: FileDTO) => string }} props
 */
export function ImageGallery(props) {
  return html`<div class="files-gallery">
    ${props.files.map(
      (f) => html`<a
        key=${f.id}
        class="files-thumb"
        href=${props.urlFor(f)}
        target="_blank"
        rel="noopener"
        title=${f.name}
        ><img src=${props.urlFor(f)} alt=${f.name} loading="lazy"
      /></a>`,
    )}
  </div>`;
}
