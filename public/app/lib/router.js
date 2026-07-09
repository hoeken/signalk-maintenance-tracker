/**
 * Tiny hand-rolled hash router (§7.1). Everything after '#' is client-side:
 * '#/tasks/oil-change?page=2' → { path: '/tasks/oil-change', query: {page:'2'} }.
 */
import { signal } from '../../vendor/signals.js';

/** @typedef {{ path: string, query: Record<string, string> }} Route */

/**
 * @param {string} hash
 * @returns {Route}
 */
export function parseHash(hash) {
  let h = hash || '';
  if (h.charAt(0) === '#') h = h.slice(1);
  if (h === '') h = '/';
  let path = h;
  let queryString = '';
  const qIndex = h.indexOf('?');
  if (qIndex >= 0) {
    path = h.slice(0, qIndex);
    queryString = h.slice(qIndex + 1);
  }
  if (path.charAt(0) !== '/') path = '/' + path;
  /** @type {Record<string, string>} */
  const query = {};
  new URLSearchParams(queryString).forEach(function (value, key) {
    query[key] = value;
  });
  return { path: path, query: query };
}

/**
 * @param {string} path
 * @param {Record<string, string|number|undefined|null>} [query]
 * @returns {string} location.hash value, always starting with '#/'
 */
export function formatHash(path, query) {
  const usp = new URLSearchParams();
  if (query) {
    for (const key of Object.keys(query)) {
      const value = query[key];
      if (value !== undefined && value !== null && value !== '') usp.set(key, String(value));
    }
  }
  const qs = usp.toString();
  return '#' + path + (qs ? '?' + qs : '');
}

/**
 * Match '/tasks/:slug' against '/tasks/oil-change' → {slug:'oil-change'},
 * or null when the pattern does not match.
 * @param {string} pattern
 * @param {string} path
 * @returns {Record<string, string>|null}
 */
export function matchPath(pattern, path) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  /** @type {Record<string, string>} */
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].charAt(0) === ':') {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

/** The current route; components read route.value to re-render on navigation. */
export const route = signal(parseHash(typeof location !== 'undefined' ? location.hash : ''));

/** Install the hashchange listener and sync the signal to the current hash. */
export function initRouter() {
  window.addEventListener('hashchange', function () {
    route.value = parseHash(location.hash);
  });
  route.value = parseHash(location.hash);
}

/**
 * @param {string} path
 * @param {Record<string, string|number|undefined|null>} [query]
 */
export function navigate(path, query) {
  location.hash = formatHash(path, query);
}

/**
 * Replace the current route's query string without adding a history entry
 * (used by list params so every keystroke doesn't pollute Back).
 * @param {Record<string, string|number|undefined|null>} query
 */
export function replaceQuery(query) {
  const target = formatHash(route.value.path, query);
  const url = location.pathname + location.search + target;
  history.replaceState(null, '', url);
  route.value = parseHash(target);
}
