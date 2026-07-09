/**
 * Task create/edit form (§7.5). On create the slug is a live preview derived
 * from the name until the user edits it; on edit the slug is an editable
 * field with a deep-link warning (§6.4). Seed last_maintenance/last_runtime
 * are offered on create only.
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import { Modal } from './Modal.js';
import { MarkdownView } from './MarkdownView.js';
import { TagInput } from './TagInput.js';
import { PathPicker } from './PathPicker.js';
import { createTask, updateTask, useTags } from '../api/hooks.js';
import { slugify } from '../lib/slug.js';
import { toast } from '../lib/toasts.js';

/** @typedef {import('../types.js').TaskDTO} TaskDTO */
/** @typedef {import('../types.js').TaskInput} TaskInput */
/** @typedef {import('../types.js').TimeUnit} TimeUnit */

const TIME_UNITS = ['days', 'weeks', 'months', 'years'];

/**
 * @param {{ task: TaskDTO|null, onClose: () => void, onSaved?: (task: TaskDTO) => void }} props
 */
export function TaskFormModal(props) {
  const task = props.task;
  const isEdit = !!task;

  const [name, setName] = useState(task ? task.name : '');
  const [slug, setSlug] = useState(task ? task.slug : '');
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(
    task && task.description ? task.description : '',
  );
  const [preview, setPreview] = useState(false);
  const [tags, setTags] = useState(task ? task.tags.slice() : []);
  const [runtimeInterval, setRuntimeInterval] = useState(
    task && task.runtime_interval !== null ? String(task.runtime_interval) : '',
  );
  const [runtimePath, setRuntimePath] = useState(
    task && task.runtime_path ? task.runtime_path : '',
  );
  const [timeInterval, setTimeInterval] = useState(
    task && task.time_interval !== null ? String(task.time_interval) : '',
  );
  const [timeUnit, setTimeUnit] = useState(
    task && task.time_interval_unit ? task.time_interval_unit : 'months',
  );
  const [seedMaintenance, setSeedMaintenance] = useState('');
  const [seedRuntime, setSeedRuntime] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const tagsRes = useTags();
  const suggestions = (tagsRes.data ? tagsRes.data.data : []).map(
    (t) => t.name,
  );

  const effectiveSlug = slugTouched ? slug : slugify(name || '');
  const slugChanged = isEdit && task && effectiveSlug !== task.slug;

  /** @param {Event} e */
  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    /** @type {TaskInput} */
    const input = {
      name: name.trim(),
      description: description.trim() ? description : null,
      tags: tags,
      runtime_path: runtimePath.trim() ? runtimePath.trim() : null,
      runtime_interval: null,
      time_interval: null,
      time_interval_unit: null,
    };
    if (runtimeInterval.trim() !== '') {
      const hours = Number(runtimeInterval);
      if (!isFinite(hours) || hours <= 0) {
        setError('Runtime interval must be a positive number of hours.');
        return;
      }
      input.runtime_interval = hours;
    }
    if (timeInterval.trim() !== '') {
      const magnitude = Number(timeInterval);
      if (
        !isFinite(magnitude) ||
        magnitude <= 0 ||
        Math.floor(magnitude) !== magnitude
      ) {
        setError('Time interval must be a positive whole number.');
        return;
      }
      input.time_interval = magnitude;
      input.time_interval_unit = /** @type {TimeUnit} */ (timeUnit);
    }
    if (isEdit) {
      if (slugChanged) input.slug = effectiveSlug;
    } else {
      if (slugTouched && slug.trim()) input.slug = slug.trim();
      if (seedMaintenance) input.last_maintenance = seedMaintenance;
      if (seedRuntime.trim() !== '') {
        const seed = Number(seedRuntime);
        if (!isFinite(seed) || seed < 0) {
          setError('Seed runtime must be a non-negative number of hours.');
          return;
        }
        input.last_runtime = seed;
      }
    }

    setBusy(true);
    try {
      const saved =
        isEdit && task
          ? await updateTask(task.slug, input)
          : await createTask(input);
      toast(isEdit ? 'Task updated.' : 'Task created.', 'success');
      if (props.onSaved) props.onSaved(saved);
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
    }
  };

  const footer = html`
    <button type="button" class="btn" onClick=${props.onClose} disabled=${busy}>
      Cancel
    </button>
    <button
      type="submit"
      form="task-form"
      class="btn btn-primary"
      disabled=${busy}
    >
      ${busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
    </button>
  `;

  return html`
    <${Modal}
      title=${isEdit ? 'Edit task' : 'New task'}
      onClose=${props.onClose}
      footer=${footer}
    >
      <form id="task-form" onSubmit=${onSubmit}>
        ${error ? html`<div class="form-error">${error}</div>` : null}

        <div class="field">
          <label class="field-label" for="task-name">Name</label>
          <input
            id="task-name"
            class="input"
            value=${name}
            onInput=${(/** @type {any} */ e) => setName(e.currentTarget.value)}
          />
        </div>

        <div class="field">
          <label class="field-label" for="task-slug">Slug</label>
          <input
            id="task-slug"
            class="input slug-preview"
            value=${effectiveSlug}
            onInput=${(/** @type {any} */ e) => {
              setSlugTouched(true);
              setSlug(e.currentTarget.value);
            }}
          />
          ${
            slugChanged
              ? html`<div class="field-hint">
                  <i class="bi bi-exclamation-triangle" /> Changing the slug
                  breaks existing deep links to this task.
                </div>`
              : html`<div class="field-hint">
                  Used in URLs and SignalK notifications.
                </div>`
          }
        </div>

        <div class="field">
          <label class="field-label" for="task-description">
            Description (markdown)${' '}
            <button
              type="button"
              class="btn-link"
              onClick=${() => setPreview(!preview)}
            >
              ${preview ? 'edit' : 'preview'}
            </button>
          </label>
          ${
            preview
              ? html`<div class="card">
                  <${MarkdownView}
                    markdown=${description || '_Nothing to preview._'}
                  />
                </div>`
              : html`<textarea
                  id="task-description"
                  class="textarea"
                  value=${description}
                  onInput=${(/** @type {any} */ e) => setDescription(e.currentTarget.value)}
                />`
          }
        </div>

        <div class="field">
          <label class="field-label">Tags</label>
          <${TagInput}
            value=${tags}
            onChange=${setTags}
            suggestions=${suggestions}
          />
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label" for="task-runtime-interval"
              >Runtime interval (hours)</label
            >
            <input
              id="task-runtime-interval"
              class="input"
              type="number"
              min="0"
              step="any"
              value=${runtimeInterval}
              onInput=${(/** @type {any} */ e) => setRuntimeInterval(e.currentTarget.value)}
            />
            <div class="field-hint">Empty = no runtime tracking.</div>
          </div>
          <div class="field">
            <label class="field-label" for="task-time-interval"
              >Time interval</label
            >
            <div class="field-row">
              <input
                id="task-time-interval"
                class="input"
                type="number"
                min="0"
                step="1"
                value=${timeInterval}
                onInput=${(/** @type {any} */ e) => setTimeInterval(e.currentTarget.value)}
              />
              <select
                class="select"
                aria-label="Time interval unit"
                value=${timeUnit}
                onInput=${(/** @type {any} */ e) => setTimeUnit(e.currentTarget.value)}
              >
                ${TIME_UNITS.map((u) => html`<option key=${u} value=${u}>${u}</option>`)}
              </select>
            </div>
            <div class="field-hint">Empty = no calendar tracking.</div>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Runtime path (SignalK)</label>
          <${PathPicker} value=${runtimePath} onChange=${setRuntimePath} />
        </div>

        ${
          !isEdit
            ? html`
                <div class="field-row">
                  <div class="field">
                    <label class="field-label" for="task-seed-date"
                      >Last maintenance (optional seed)</label
                    >
                    <input
                      id="task-seed-date"
                      class="input"
                      type="date"
                      value=${seedMaintenance}
                      onInput=${(/** @type {any} */ e) => setSeedMaintenance(e.currentTarget.value)}
                    />
                  </div>
                  <div class="field">
                    <label class="field-label" for="task-seed-runtime"
                      >Runtime at last maintenance (h)</label
                    >
                    <input
                      id="task-seed-runtime"
                      class="input"
                      type="number"
                      min="0"
                      step="any"
                      value=${seedRuntime}
                      onInput=${(/** @type {any} */ e) => setSeedRuntime(e.currentTarget.value)}
                    />
                  </div>
                </div>
              `
            : null
        }
      </form>
    <//>
  `;
}
