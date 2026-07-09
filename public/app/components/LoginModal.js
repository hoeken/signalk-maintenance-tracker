/**
 * Login modal (§7.7): built on the shared Modal, opened from AuthControl or
 * automatically on a 401. Always rendered by the shell; gates itself on the
 * loginModalOpen signal.
 */
import { html } from '../lib/html.js';
import { useState } from '../../vendor/preact-hooks.js';
import { Modal } from './Modal.js';
import { login, loginModalOpen, closeLoginModal } from '../auth/auth.js';
import { toast } from '../lib/toasts.js';

export function LoginModal() {
  if (!loginModalOpen.value) return null;
  return html`<${LoginForm} />`;
}

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /** @param {Event} e */
  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password, rememberMe);
      closeLoginModal();
      toast('Logged in as ' + username, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return html`
    <${Modal} title="Log in" narrow onClose=${closeLoginModal}>
      <form onSubmit=${onSubmit}>
        ${error ? html`<div class="form-error">${error}</div>` : null}
        <div class="field">
          <label class="field-label" for="login-username">Username</label>
          <input
            id="login-username"
            class="input"
            autocomplete="username"
            value=${username}
            onInput=${(/** @type {any} */ e) => setUsername(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label class="field-label" for="login-password">Password</label>
          <input
            id="login-password"
            class="input"
            type="password"
            autocomplete="current-password"
            value=${password}
            onInput=${(/** @type {any} */ e) => setPassword(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label class="field-label" for="login-remember">
            <input
              id="login-remember"
              type="checkbox"
              checked=${rememberMe}
              onInput=${(/** @type {any} */ e) => setRememberMe(e.currentTarget.checked)}
            />
            ${' '}Remember me
          </label>
        </div>
        <button type="submit" class="btn btn-primary" disabled=${busy || !username}>
          ${busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    <//>
  `;
}
