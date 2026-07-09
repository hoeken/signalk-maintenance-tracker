/**
 * SignalK runtime-path discovery for the task editor (§8.4). Fetches the
 * vessels/self snapshot ONCE per app session (lazily, on first task-editor
 * open), flattens it to candidate path names, and serves autocomplete from
 * the cached list. Never a source of runtime *values* — those come from the
 * plugin API as current_runtime.
 */
import { useResource } from './resource.js';

/**
 * Keys that are leaf metadata, not path segments, in the REST snapshot.
 * @type {Record<string, boolean>}
 */
const NON_PATH_KEYS = {
  value: true,
  values: true,
  timestamp: true,
  $source: true,
  source: true,
  meta: true,
  pgn: true,
  sentence: true,
};

/**
 * Flatten a vessels/self REST snapshot into dotted candidate paths. A node
 * carrying a `value` key is a leaf; only numeric (or still-null) leaves are
 * candidates for a runtime path.
 * @param {any} node
 * @param {string} [prefix]
 * @param {string[]} [out]
 * @returns {string[]} sorted candidate paths
 */
export function flattenPaths(node, prefix, out) {
  const paths = out || [];
  if (!node || typeof node !== 'object') return paths;
  if (Object.prototype.hasOwnProperty.call(node, 'value')) {
    if (prefix && (typeof node.value === 'number' || node.value === null)) paths.push(prefix);
    return paths;
  }
  for (const key of Object.keys(node)) {
    if (NON_PATH_KEYS[key]) continue;
    const child = node[key];
    if (!child || typeof child !== 'object') continue; // identity strings like uuid/mmsi
    flattenPaths(child, prefix ? prefix + '.' + key : key, paths);
  }
  if (!prefix) paths.sort();
  return paths;
}

/**
 * @returns {import('./resource.js').ResourceState<string[]>}
 */
export function useSignalKPaths() {
  // No refetchInterval: fetched once and cached for the session (§8.4).
  return useResource('sk-paths', async () => {
    const res = await fetch('/signalk/v1/api/vessels/self', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('SignalK snapshot failed (' + res.status + ')');
    const snapshot = await res.json();
    return flattenPaths(snapshot);
  });
}
