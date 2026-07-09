/**
 * Runtime-path autocomplete (§8.4): free-text input over the candidate paths
 * flattened from SignalK's vessels/self snapshot. The snapshot is fetched
 * once per session, lazily — this component only mounts inside the task
 * editor, so read-only sessions never pay the cost.
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import { useSignalKPaths } from '../api/signalkPaths.js';

/**
 * @param {{ value: string, onChange: (path: string) => void }} props
 */
export function PathPicker(props) {
  const [open, setOpen] = useState(false);
  const paths = useSignalKPaths();

  const value = props.value || '';
  const candidates = paths.data || [];
  const matches = candidates
    .filter(
      (p) => !value || p.toLowerCase().indexOf(value.toLowerCase()) !== -1,
    )
    .slice(0, 10);

  return html`
    <div class="combo">
      <input
        class="input"
        placeholder="e.g. propulsion.port.runTime"
        value=${value}
        onInput=${(/** @type {any} */ e) => {
          props.onChange(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus=${() => setOpen(true)}
        onBlur=${() => setTimeout(() => setOpen(false), 150)}
      />
      ${
        open && matches.length
          ? html`<ul class="combo-list">
              ${matches.map(
                (p) =>
                  html`<li
                    key=${p}
                    onMouseDown=${() => {
                      props.onChange(p);
                      setOpen(false);
                    }}
                  >
                    ${p}
                  </li>`,
              )}
            </ul>`
          : null
      }
      ${
        paths.error
          ? html`<div class="field-hint">
              Could not load paths from SignalK — free text still works.
            </div>`
          : null
      }
    </div>
  `;
}
