/**
 * Authentication against SignalK's own endpoints (§7.7, §8.6). Module-level
 * signals hold the session state; the plugin API rides on the same-origin
 * session cookie, so there is no token handling here.
 */
import { signal } from '../../vendor/signals.js';
import { toast } from '../lib/toasts.js';
import { invalidateAll } from '../api/resource.js';

/** @typedef {{ checked: boolean, isLoggedIn: boolean, username: string|null }} AuthState */

/** @type {import('../../vendor/signals.js').Signal<AuthState>} */
export const authState = signal({
  checked: false,
  isLoggedIn: false,
  username: null,
});

export const loginModalOpen = signal(false);

/** @type {ReturnType<typeof setTimeout>|null} */
let renewTimer = null;
let unauthorizedNotified = false;

export function openLoginModal() {
  loginModalOpen.value = true;
}

export function closeLoginModal() {
  loginModalOpen.value = false;
  unauthorizedNotified = false;
}

/**
 * Establish/refresh session state from GET /skServer/loginStatus (§8.6).
 */
export async function refreshLoginStatus() {
  try {
    const res = await fetch('/skServer/loginStatus', {
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error('loginStatus returned ' + res.status);
    const body = await res.json();
    const isLoggedIn = !!body && body.status === 'loggedIn';
    authState.value = {
      checked: true,
      isLoggedIn: isLoggedIn,
      username:
        isLoggedIn && typeof body.username === 'string' ? body.username : null,
    };
  } catch {
    // Can't reach the server or no security configured — treat as logged out.
    authState.value = { checked: true, isLoggedIn: false, username: null };
  }
}

/**
 * POST /signalk/v1/auth/login. Resolves on success; throws with a
 * user-displayable message on failure (401 → invalid credentials).
 * @param {string} username
 * @param {string} password
 * @param {boolean} [rememberMe]
 */
export async function login(username, password, rememberMe) {
  const res = await fetch('/signalk/v1/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: username,
      password: password,
      rememberMe: !!rememberMe,
    }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? 'Invalid username or password'
        : 'Login failed (' + res.status + ')',
    );
  }
  /** @type {{ token?: string, timeToLive?: number }|null} */
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  authState.value = { checked: true, isLoggedIn: true, username: username };
  unauthorizedNotified = false;
  scheduleRenewal(
    body && typeof body.timeToLive === 'number' ? body.timeToLive : null,
  );
  // Data fetched while logged out may have 401'd — refetch everything live.
  invalidateAll();
}

/** PUT /signalk/v1/auth/logout; local state is cleared regardless of outcome. */
export async function logout() {
  try {
    await fetch('/signalk/v1/auth/logout', {
      method: 'PUT',
      credentials: 'same-origin',
    });
  } catch {
    // ignore — we still drop the local session
  }
  if (renewTimer) {
    clearTimeout(renewTimer);
    renewTimer = null;
  }
  authState.value = { checked: true, isLoggedIn: false, username: null };
}

/**
 * Re-validate before the token's timeToLive elapses (§7.7).
 * @param {number|null} timeToLiveSeconds
 */
function scheduleRenewal(timeToLiveSeconds) {
  if (renewTimer) clearTimeout(renewTimer);
  renewTimer = null;
  if (!timeToLiveSeconds || timeToLiveSeconds <= 0) return;
  const delayMs = Math.max(timeToLiveSeconds * 1000 * 0.8, 10000);
  renewTimer = setTimeout(function () {
    renewTimer = null;
    refreshLoginStatus().then(function () {
      if (authState.value.isLoggedIn) scheduleRenewal(timeToLiveSeconds);
    });
  }, delayMs);
}

/**
 * Called by the API client on any 401/403 (§7.6): flip to logged-out and
 * prompt re-login (once, not per failing poll).
 */
export function onUnauthorized() {
  authState.value = { checked: true, isLoggedIn: false, username: null };
  if (unauthorizedNotified || loginModalOpen.value) return;
  unauthorizedNotified = true;
  toast('Please log in to load maintenance data.', 'error');
  openLoginModal();
}

/**
 * Hook façade over the auth signals (§7.7). Reading authState.value inside a
 * component render subscribes it via @preact/signals.
 */
export function useAuth() {
  const state = authState.value;
  return {
    checked: state.checked,
    isLoggedIn: state.isLoggedIn,
    username: state.username,
    login: login,
    logout: logout,
    openLoginModal: openLoginModal,
  };
}
