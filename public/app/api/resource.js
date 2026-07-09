/**
 * Hand-rolled signals-backed resource layer (§7.6): cache-by-key, polling
 * while subscribed, and invalidation. The essentials of react-query in a few
 * dozen lines, with no post-Chromium-69 runtime APIs.
 */
import { signal } from '../../vendor/signals.js';
import { useEffect } from '../../vendor/preact-hooks.js';

/**
 * @template T
 * @typedef {{ data: T|null, error: Error|null, loading: boolean }} ResourceState
 */

/**
 * @typedef {Object} Entry
 * @property {string} key
 * @property {() => Promise<any>} fetcher
 * @property {number} refetchInterval 0 = never poll
 * @property {import('../../vendor/signals.js').Signal<ResourceState<any>>} state
 * @property {number} subscribers
 * @property {ReturnType<typeof setInterval>|null} timer
 * @property {number} fetchId
 * @property {boolean} fetched
 */

/** @type {Map<string, Entry>} */
const registry = new Map();

/**
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @param {{ refetchInterval?: number }} [options]
 * @returns {Entry}
 */
function getEntry(key, fetcher, options) {
  let entry = registry.get(key);
  if (!entry) {
    entry = {
      key: key,
      fetcher: fetcher,
      refetchInterval:
        options && options.refetchInterval ? options.refetchInterval : 0,
      state: signal({ data: null, error: null, loading: true }),
      subscribers: 0,
      timer: null,
      fetchId: 0,
      fetched: false,
    };
    registry.set(key, entry);
  }
  entry.fetcher = fetcher; // latest closure wins (params live in the key)
  return entry;
}

/** @param {Entry} entry */
function runFetch(entry) {
  const id = ++entry.fetchId;
  const prev = entry.state.value;
  entry.state.value = { data: prev.data, error: prev.error, loading: true };
  entry.fetched = true;
  entry.fetcher().then(
    function (data) {
      if (id === entry.fetchId)
        entry.state.value = { data: data, error: null, loading: false };
    },
    function (error) {
      // keep stale data visible; surface the error alongside it
      if (id === entry.fetchId)
        entry.state.value = { data: prev.data, error: error, loading: false };
    },
  );
}

/**
 * Subscribe to a keyed resource for the lifetime of the calling component.
 * Fetches on first subscribe, polls (shared per key) while any subscriber is
 * mounted, and re-fetches when a component subscribes to an idle key again.
 *
 * Reading the returned state inside render subscribes the component via
 * @preact/signals, so it re-renders on data/error/loading changes.
 *
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {{ refetchInterval?: number }} [options]
 * @returns {ResourceState<T>}
 */
export function useResource(key, fetcher, options) {
  const entry = getEntry(key, fetcher, options);
  useEffect(
    function () {
      entry.subscribers++;
      if (entry.subscribers === 1) {
        if (!entry.fetched || !entry.state.value.loading) runFetch(entry);
        if (entry.refetchInterval > 0 && !entry.timer) {
          entry.timer = setInterval(function () {
            runFetch(entry);
          }, entry.refetchInterval);
        }
      }
      return function () {
        entry.subscribers--;
        if (entry.subscribers <= 0 && entry.timer) {
          clearInterval(entry.timer);
          entry.timer = null;
        }
      };
    },
    [key],
  );
  return entry.state.value;
}

/**
 * Invalidate resources by key prefix: live ones (with subscribers) refetch
 * immediately; idle ones are dropped so their next mount refetches.
 * 'tasks' matches 'tasks' and 'tasks?…' but not 'task/…'.
 * @param {...string} prefixes
 */
export function invalidate() {
  const prefixes = Array.prototype.slice.call(arguments);
  const keys = Array.from(registry.keys());
  for (const key of keys) {
    const hit = prefixes.some(function (prefix) {
      return (
        key === prefix ||
        key.indexOf(prefix + '?') === 0 ||
        key.indexOf(prefix + '/') === 0
      );
    });
    if (!hit) continue;
    const entry = registry.get(key);
    if (!entry) continue;
    if (entry.subscribers > 0) runFetch(entry);
    else registry.delete(key);
  }
}

/** Refetch/drop everything (used after login, §7.7). */
export function invalidateAll() {
  const keys = Array.from(registry.keys());
  for (const key of keys) {
    const entry = registry.get(key);
    if (!entry) continue;
    if (entry.subscribers > 0) runFetch(entry);
    else registry.delete(key);
  }
}

/** Test helper: forget all cached resources. */
export function resetResources() {
  for (const entry of registry.values()) {
    if (entry.timer) clearInterval(entry.timer);
  }
  registry.clear();
}
