/**
 * A log entry's details (§7.5), read-only: what it was for, when, at what
 * runtime and by whom, then its notes and attachments — documents by name and
 * images as thumbnails, the same way the task detail page shows a task's.
 * Opened from the magnifying glass on a log row, so the log tables themselves
 * stay compact.
 */
import { html } from '../lib/html.js';
import { Modal } from './Modal.js';
import { StatTable } from './StatTable.js';
import { MarkdownView } from './MarkdownView.js';
import { FileList, ImageGallery } from './AttachmentList.js';
import { logFileUrl } from '../api/hooks.js';
import { splitAttachments } from '../lib/files.js';
import {
  formatDate,
  formatHours,
  formatTimestampDate,
  formatUser,
} from '../lib/format.js';

/** @typedef {import('../types.js').LogDTO} LogDTO */

/**
 * `subject` names what the entry is for (the task, or a standalone entry's
 * title) when the caller knows it.
 * @param {{ entry: LogDTO, subject?: string|null, onClose: () => void }} props
 */
export function LogDetailsModal(props) {
  const entry = props.entry;
  const { images, documents } = splitAttachments(entry.files || []);
  /** @param {import('../types.js').FileDTO} f */
  const urlFor = (f) => logFileUrl(entry.id, f.id);
  const when = formatDate(entry.maintenance_date);
  const title =
    'Log entry — ' + (props.subject ? props.subject + ', ' + when : when);
  return html`
    <${Modal} title=${title} onClose=${props.onClose}>
      <div class="details-section">
        <${StatTable}
          rows=${[
            {
              label: 'Task',
              value: entry.task_slug
                ? html`<a
                      href=${'#/tasks/' + encodeURIComponent(entry.task_slug)}
                      onClick=${props.onClose}
                      >${entry.task_name}</a
                    >`
                : null,
            },
            { label: 'Title', value: entry.title },
            { label: 'Completed', value: when },
            { label: 'Logged', value: formatTimestampDate(entry.created_at) },
            {
              label: 'Updated',
              value: entry.updated_at
                ? formatTimestampDate(entry.updated_at)
                : null,
            },
            { label: 'Runtime', value: formatHours(entry.runtime_hours) },
            {
              label: 'Logged by',
              value: entry.logged_by ? formatUser(entry.logged_by) : '—',
            },
          ]}
        />
      </div>
      ${
        entry.notes
          ? html`<div class="details-section">
              <h3>Notes</h3>
              <${MarkdownView} markdown=${entry.notes} />
            </div>`
          : null
      }
      ${
        documents.length
          ? html`<div class="details-section">
              <h3>Files</h3>
              <${FileList} files=${documents} urlFor=${urlFor} />
            </div>`
          : null
      }
      ${
        images.length
          ? html`<div class="details-section">
              <h3>Images</h3>
              <${ImageGallery} files=${images} urlFor=${urlFor} />
            </div>`
          : null
      }
    <//>
  `;
}
