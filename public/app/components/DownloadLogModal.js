/**
 * Download-log modal (§7.4): pick an output format (CSV / Markdown / JSON),
 * then fetch the log entries and download them. Shared by the master log and
 * a single task's log — the caller supplies how to fetch the entries and the
 * filename base.
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import { Modal } from './Modal.js';
import {
  EXPORT_FORMATS,
  buildLogExport,
  triggerDownload,
  dateStamp,
} from '../lib/logExport.js';

/** @typedef {import('../types.js').LogDTO} LogDTO */

/**
 * @param {{
 *   title?: string,
 *   filenameBase: string,
 *   fetchEntries: () => Promise<LogDTO[]>,
 *   onClose: () => void,
 * }} props
 */
export function DownloadLogModal(props) {
  const [format, setFormat] = useState('csv');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** @param {Event} e */
  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const entries = await props.fetchEntries();
      const fmt =
        EXPORT_FORMATS.find((f) => f.value === format) || EXPORT_FORMATS[0];
      const content = buildLogExport(entries, fmt.value);
      const filename = props.filenameBase + '-' + dateStamp() + '.' + fmt.ext;
      triggerDownload(content, filename, fmt.mime);
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setBusy(false);
    }
  };

  const footer = html`
    <button type="button" class="btn" onClick=${props.onClose} disabled=${busy}>
      Cancel
    </button>
    <button
      type="submit"
      form="download-log-form"
      class="btn btn-primary"
      disabled=${busy}
    >
      <i class="bi bi-download" />${busy ? 'Preparing…' : 'Download'}
    </button>
  `;

  return html`
    <${Modal}
      title=${props.title || 'Download log'}
      onClose=${props.onClose}
      footer=${footer}
      narrow=${true}
    >
      <form id="download-log-form" onSubmit=${onSubmit}>
        ${error ? html`<div class="form-error">${error}</div>` : null}
        <div class="field">
          <span class="field-label">Format</span>
          <div class="radio-group">
            ${EXPORT_FORMATS.map(
              (f) => html`<label key=${f.value} class="radio-option">
                <input
                  type="radio"
                  name="export-format"
                  value=${f.value}
                  checked=${format === f.value}
                  onInput=${() => setFormat(f.value)}
                />
                ${' '}${f.label}
              </label>`,
            )}
          </div>
        </div>
      </form>
    <//>
  `;
}
