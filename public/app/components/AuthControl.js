/**
 * Header auth control (§7.7): "Log in" when anonymous, username + "Log out"
 * when authenticated.
 */
import { html } from '../lib/html.js';
import { useAuth } from '../auth/auth.js';

export function AuthControl() {
  const auth = useAuth();
  if (!auth.isLoggedIn) {
    return html`
      <button type="button" class="btn" onClick=${auth.openLoginModal}>
        <i class="bi bi-box-arrow-in-right" />Log in
      </button>
    `;
  }
  return html`
    <span class="shell-user">
      <i class="bi bi-person-circle" /> ${auth.username}
    </span>
    <button type="button" class="btn-icon" aria-label="Log out" title="Log out" onClick=${() => auth.logout()}>
      <i class="bi bi-box-arrow-right" />
    </button>
  `;
}
