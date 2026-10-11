/**
 * Attachments editor for the task form: the task's files with their sizes,
 * a delete per row, and an upload button. Unlike the rest of the form these
 * act on the server immediately — a file is too big to ride along in the
 * task's JSON body, so each upload/delete is its own request and the list
 * here reflects what the server has right now. Deleting asks for an inline
 * confirmation first, since there is no Cancel to fall back on.
 */
import { html } from '../lib/html.js';
import { useEffect, useState } from '../../vendor/preact-hooks.js';
import { deleteTaskFile, uploadTaskFile } from '../api/hooks.js';
import { formatBytes } from '../lib/format.js';
import { toast } from '../lib/toasts.js';

/** @typedef {import('../types.js').TaskFileDTO} TaskFileDTO */

/**
 * @param {{ slug: string, files: TaskFileDTO[] }} props
 */
export function FilesField(props) {
  const [files, setFiles] = useState(props.files || []);
  const [uploading, setUploading] = useState(
    /** @type {{ name: string, fraction: number }|null} */ (null),
  );
  const [pendingDelete, setPendingDelete] = useState(
    /** @type {number|null} */ (null),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The parent re-renders with fresh task data after each change (and on
  // its poll); the server's list wins over the local copy whenever it lands.
  useEffect(() => {
    setFiles(props.files || []);
  }, [props.files]);

  /** @param {Event} e */
  const onPick = async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const picked = Array.prototype.slice.call(input.files || []);
    if (!picked.length) return;
    setError('');
    setBusy(true);
    try {
      for (const file of picked) {
        setUploading({ name: file.name, fraction: 0 });
        const saved = await uploadTaskFile(props.slug, file, (fraction) =>
          setUploading({ name: file.name, fraction: fraction }),
        );
        setFiles((prev) => prev.concat([saved]));
        toast('Uploaded ' + saved.name + '.', 'success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
      setBusy(false);
      input.value = '';
    }
  };

  /** @param {TaskFileDTO} file */
  const remove = async (file) => {
    setError('');
    setBusy(true);
    try {
      await deleteTaskFile(props.slug, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      setPendingDelete(null);
      toast('Deleted ' + file.name + '.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return html`
    <div>
      ${
        files.length
          ? html`<ul class="files-list">
              ${files.map(
                (f) => html`
                  <li key=${f.id} class="files-row">
                    <span class="files-name">${f.name}</span>
                    <span class="files-size">${formatBytes(f.size)}</span>
                    ${
                      pendingDelete === f.id
                        ? html`<span class="files-confirm">
                            <button
                              type="button"
                              class="btn btn-danger"
                              disabled=${busy}
                              onClick=${() => remove(f)}
                            >
                              ${busy ? 'Deleting…' : 'Delete'}
                            </button>
                            <button
                              type="button"
                              class="btn"
                              disabled=${busy}
                              onClick=${() => setPendingDelete(null)}
                            >
                              Cancel
                            </button>
                          </span>`
                        : html`<button
                            type="button"
                            class="btn-icon danger"
                            aria-label=${'Delete ' + f.name}
                            title="Delete"
                            disabled=${busy}
                            onClick=${() => setPendingDelete(f.id)}
                          >
                            <i class="bi bi-trash" />
                          </button>`
                    }
                  </li>
                `,
              )}
            </ul>`
          : null
      }
      <div class="files-upload">
        <input
          id="task-files-input"
          type="file"
          multiple
          aria-label="Upload file"
          disabled=${busy}
          onChange=${onPick}
        />
        <label class=${'btn' + (busy ? ' disabled' : '')} for="task-files-input">
          <i class="bi bi-upload" />Upload file…
        </label>
        ${
          uploading
            ? html`<span class="files-name"
                  >Uploading ${uploading.name}…
                  ${Math.round(uploading.fraction * 100)}%</span
                >
                <div
                  class="files-progress"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow=${Math.round(uploading.fraction * 100)}
                >
                  <div style=${'width:' + uploading.fraction * 100 + '%'} />
                </div>`
            : null
        }
      </div>
      ${error ? html`<div class="field-error">${error}</div>` : null}
      <div class="field-hint">
        Manuals, receipts, photos — any type, up to 1 GB each. Uploads and
        deletions apply immediately.
      </div>
    </div>
  `;
}
