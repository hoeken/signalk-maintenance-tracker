/**
 * A log entry's attachments (§7.5), read-only: documents by name and images
 * as thumbnails, the same way the task detail page shows a task's. Opened
 * from the paperclip on a log row — the log tables themselves stay compact.
 */
import { html } from '../lib/html.js';
import { Modal } from './Modal.js';
import { FileList, ImageGallery } from './AttachmentList.js';
import { logFileUrl } from '../api/hooks.js';
import { splitAttachments } from '../lib/files.js';
import { formatDate } from '../lib/format.js';

/** @typedef {import('../types.js').LogDTO} LogDTO */

/**
 * `subject` names what the entry is for (the task, or a standalone entry's
 * title) when the caller knows it.
 * @param {{ entry: LogDTO, subject?: string|null, onClose: () => void }} props
 */
export function LogAttachmentsModal(props) {
  const entry = props.entry;
  const { images, documents } = splitAttachments(entry.files || []);
  /** @param {import('../types.js').FileDTO} f */
  const urlFor = (f) => logFileUrl(entry.id, f.id);
  const when = formatDate(entry.maintenance_date);
  const title =
    'Attachments — ' + (props.subject ? props.subject + ', ' + when : when);
  return html`
    <${Modal} title=${title} onClose=${props.onClose}>
      ${
        documents.length
          ? html`<div class="attachments-section">
              <h3>Files</h3>
              <${FileList} files=${documents} urlFor=${urlFor} />
            </div>`
          : null
      }
      ${
        images.length
          ? html`<div class="attachments-section">
              <h3>Images</h3>
              <${ImageGallery} files=${images} urlFor=${urlFor} />
            </div>`
          : null
      }
      ${
        !documents.length && !images.length
          ? html`<p class="muted">No attachments.</p>`
          : null
      }
    <//>
  `;
}
