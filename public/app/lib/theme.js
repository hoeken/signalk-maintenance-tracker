/**
 * Light/dark theme via data-theme on <html> + CSS custom properties (§7.3).
 * index.html sets the attribute before first paint; this module owns it after.
 */
import { signal } from '../../vendor/signals.js';

const STORAGE_KEY = 'smt-theme';

/** @returns {'light'|'dark'} */
function initialTheme() {
  // B&G / Navico MFDs pass ?mode=night or ?mode=day instead of honoring
  // prefers-color-scheme; the param overrides everything, including the
  // saved preference. Must match the first-paint script in index.html.
  const modeMatch = /[?&]mode=([^&]*)/.exec(window.location.search);
  if (modeMatch) {
    return decodeURIComponent(modeMatch[1]) === 'night' ? 'dark' : 'light';
  }
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    stored = null; // storage can be blocked; fall through to media query
  }
  if (stored === 'light' || stored === 'dark') return stored;
  // Progressive enhancement: prefers-color-scheme is Chrome 76+. On the
  // Chromium 69 floor it never matches and we default to light (§7.9).
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** @type {import('../../vendor/signals.js').Signal<'light'|'dark'>} */
export const theme = signal(initialTheme());

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme.value);
}

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(STORAGE_KEY, theme.value);
  } catch (err) {
    // non-fatal: theme just won't persist
  }
  applyTheme();
}
