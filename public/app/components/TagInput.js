/**
 * Creatable multi-select for task tags (§7.5): chips for the selected tags,
 * a text input that adds on Enter/comma, and suggestions from GET /tags.
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';

/**
 * @param {{ value: string[], onChange: (tags: string[]) => void, suggestions: string[] }} props
 */
export function TagInput(props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  const selected = props.value || [];
  const lowerSelected = selected.map((t) => t.toLowerCase());
  const matches = (props.suggestions || [])
    .filter((s) => lowerSelected.indexOf(s.toLowerCase()) === -1)
    .filter((s) => !text || s.toLowerCase().indexOf(text.toLowerCase()) !== -1)
    .slice(0, 8);

  /** @param {string} tag */
  const add = (tag) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (lowerSelected.indexOf(trimmed.toLowerCase()) !== -1) {
      setText('');
      return;
    }
    props.onChange(selected.concat([trimmed]));
    setText('');
  };

  /** @param {string} tag */
  const remove = (tag) => {
    props.onChange(selected.filter((t) => t !== tag));
  };

  /** @param {KeyboardEvent & { currentTarget: HTMLInputElement }} e */
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && selected.length) {
      remove(selected[selected.length - 1]);
    }
  };

  return html`
    <div>
      ${selected.length
        ? html`<div class="chips" style="margin-bottom:6px">
            ${selected.map(
              (tag) => html`
                <button type="button" key=${tag} class="chip selected" onClick=${() => remove(tag)} title="Remove tag">
                  ${tag}<i class="bi bi-x" />
                </button>
              `
            )}
          </div>`
        : null}
      <div class="combo">
        <input
          class="input"
          placeholder="Add tag and press Enter"
          value=${text}
          onInput=${(/** @type {any} */ e) => {
            setText(e.currentTarget.value);
            setOpen(true);
          }}
          onKeyDown=${onKeyDown}
          onFocus=${() => setOpen(true)}
          onBlur=${() => setTimeout(() => setOpen(false), 150)}
        />
        ${open && matches.length
          ? html`<ul class="combo-list">
              ${matches.map((s) => html`<li key=${s} onMouseDown=${() => add(s)}>${s}</li>`)}
            </ul>`
          : null}
      </div>
    </div>
  `;
}
