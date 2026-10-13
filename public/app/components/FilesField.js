/**
 * Attachments editor shared by the task form and the log-entry form: the
 * current files with their sizes, a delete per row, and an upload button.
 *
 * Two modes. With `upload`/`remove` callbacks the field acts on the server
 * immediately — a file is too big to ride along in a JSON body, so each
 * upload/delete is its own request and the list here reflects what the
 * server has right now; deleting asks for an inline confirmation first,
 * since there is no Cancel to fall back on. Without them (`pending` +
 * `onPendingChange`) the owner doesn't exist yet: picked files are only held
 * locally for the parent to upload once it has saved and has an id, with
 * the parent reporting progress back through `uploading`.
 */
import { html } from '../lib/html.js';
import { useEffect, useState } from '../../vendor/preact-hooks.js';
import { formatBytes } from '../lib/format.js';
import { toast } from '../lib/toasts.js';

/** @typedef {import('../types.js').FileDTO} FileDTO */

/**
 * @param {{
 *   id?: string,
 *   files?: FileDTO[],
 *   upload?: (file: File, onProgress: (fraction: number) => void) => Promise<FileDTO>,
 *   remove?: (file: FileDTO) => Promise<void>,
 *   pending?: File[],
 *   onPendingChange?: (files: File[]) => void,
 *   uploading?: { name: string, fraction: number }|null,
 *   disabled?: boolean,
 *   hint?: string,
 * }} props
 */
export function FilesField(props) {
  const deferred = !props.upload;
  const inputId = props.id || 'files-input';
  const [files, setFiles] = useState(props.files || []);
  const [uploading, setUploading] = useState(
    /** @type {{ name: string, fraction: number }|null} */ (null),
  );
  const [pendingDelete, setPendingDelete] = useState(
    /** @type {number|null} */ (null),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The parent re-renders with fresh data after each change (and on its
  // poll); the server's list wins over the local copy whenever it lands.
  useEffect(() => {
    setFiles(props.files || []);
  }, [props.files]);

  /** @param {Event} e */
  const onPick = async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    /** @type {File[]} */
    const picked = Array.prototype.slice.call(input.files || []);
    if (!picked.length) return;
    if (deferred) {
      if (props.onPendingChange)
        props.onPendingChange((props.pending || []).concat(picked));
      input.value = '';
      return;
    }
    const upload = /** @type {NonNullable<typeof props.upload>} */ (
      props.upload
    );
    setError('');
    setBusy(true);
    try {
      for (const file of picked) {
        setUploading({ name: file.name, fraction: 0 });
        const saved = await upload(file, (fraction) =>
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

  /** @param {FileDTO} file */
  const remove = async (file) => {
    if (!props.remove) return;
    setError('');
    setBusy(true);
    try {
      await props.remove(file);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      setPendingDelete(null);
      toast('Deleted ' + file.name + '.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  /** @param {number} index */
  const removePending = (index) => {
    if (props.onPendingChange)
      props.onPendingChange(
        (props.pending || []).filter((_, i) => i !== index),
      );
  };

  const pending = props.pending || [];
  const progress = deferred ? props.uploading || null : uploading;
  const disabled = busy || !!props.disabled;

  return html`
    <div>
      ${
        !deferred && files.length
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
                              disabled=${disabled}
                              onClick=${() => remove(f)}
                            >
                              ${busy ? 'Deleting…' : 'Delete'}
                            </button>
                            <button
                              type="button"
                              class="btn"
                              disabled=${disabled}
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
                            disabled=${disabled}
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
      ${
        deferred && pending.length
          ? html`<ul class="files-list">
              ${pending.map(
                (f, i) => html`
                  <li key=${i} class="files-row">
                    <span class="files-name">${f.name}</span>
                    <span class="files-size">${formatBytes(f.size)}</span>
                    <button
                      type="button"
                      class="btn-icon danger"
                      aria-label=${'Remove ' + f.name}
                      title="Remove"
                      disabled=${disabled}
                      onClick=${() => removePending(i)}
                    >
                      <i class="bi bi-x-lg" />
                    </button>
                  </li>
                `,
              )}
            </ul>`
          : null
      }
      <div class="files-upload">
        <input
          id=${inputId}
          type="file"
          multiple
          aria-label="Upload file"
          disabled=${disabled}
          onChange=${onPick}
        />
        <label class=${'btn' + (disabled ? ' disabled' : '')} for=${inputId}>
          <i class="bi bi-upload" />${deferred ? 'Add file…' : 'Upload file…'}
        </label>
        ${
          progress
            ? html`<span class="files-name"
                  >Uploading ${progress.name}…
                  ${Math.round(progress.fraction * 100)}%</span
                >
                <div
                  class="files-progress"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow=${Math.round(progress.fraction * 100)}
                >
                  <div style=${'width:' + progress.fraction * 100 + '%'} />
                </div>`
            : null
        }
      </div>
      ${error ? html`<div class="field-error">${error}</div>` : null}
      ${props.hint ? html`<div class="field-hint">${props.hint}</div>` : null}
    </div>
  `;
}
