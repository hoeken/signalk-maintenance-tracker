/**
 * Download-log modal (§7.4): pick an output format (CSV / Markdown / JSON),
 * then fetch the log entries and download them. Shared by the master log and
 * a single task's log — the caller supplies how to fetch the entries and the
 * filename base. With "Download file attachments" ticked (the default) the
 * log and every entry's files are bundled into one .zip.
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import { Modal } from './Modal.js';
import { FormError } from './FormError.js';
import {
  EXPORT_FORMATS,
  attachmentPaths,
  buildLogExport,
  triggerDownload,
  dateStamp,
} from '../lib/logExport.js';
import { buildZip } from '../lib/zip.js';
import { logFileUrl } from '../api/hooks.js';

/** @typedef {import('../types.js').LogDTO} LogDTO */

/**
 * Fetch every entry's attachments and zip them with the log.
 * @param {LogDTO[]} entries
 * @param {{ ext: string, value: string }} fmt
 * @param {string} base filename stem, also the zip's top-level folder
 * @param {(done: number, total: number) => void} onProgress
 */
async function buildLogZip(entries, fmt, base, onProgress) {
  const paths = attachmentPaths(entries);
  const enc = new TextEncoder();
  const files = [
    {
      path: base + '/log.' + fmt.ext,
      data: enc.encode(buildLogExport(entries, fmt.value, paths)),
    },
  ];
  const total = entries.reduce((n, e) => n + (paths.get(e.id) || []).length, 0);
  let done = 0;
  onProgress(done, total);
  for (const e of entries) {
    const entryPaths = paths.get(e.id);
    if (!entryPaths) continue;
    for (let i = 0; i < e.files.length; i++) {
      const f = e.files[i];
      const res = await fetch(logFileUrl(e.id, f.id), {
        credentials: 'same-origin',
      });
      if (!res.ok)
        throw new Error(
          'Could not download "' + f.name + '" (' + res.status + ')',
        );
      files.push({
        path: base + '/' + entryPaths[i],
        data: new Uint8Array(await res.arrayBuffer()),
      });
      onProgress(++done, total);
    }
  }
  return buildZip(files);
}

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
  const [withFiles, setWithFiles] = useState(true);
  const [progress, setProgress] = useState('');
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
      const base = props.filenameBase + '-' + dateStamp();
      if (withFiles) {
        const zip = await buildLogZip(entries, fmt, base, (done, total) =>
          setProgress(
            total ? 'Fetching files ' + done + '/' + total + '…' : '',
          ),
        );
        triggerDownload(zip, base + '.zip');
      } else {
        const content = buildLogExport(entries, fmt.value);
        triggerDownload(content, base + '.' + fmt.ext, fmt.mime);
      }
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setProgress('');
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
      <i class="bi bi-download" />${busy ? progress || 'Preparing…' : 'Download'}
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
        <${FormError} message=${error} />
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
        <div class="field">
          <label class="field-label" for="download-log-files">
            <input
              id="download-log-files"
              type="checkbox"
              checked=${withFiles}
              onInput=${(/** @type {any} */ e) => setWithFiles(e.currentTarget.checked)}
            />
            ${' '}Download file attachments
          </label>
          <div class="field-hint">
            Bundles the log and every entry's files into a .zip.
          </div>
        </div>
      </form>
    <//>
  `;
}
