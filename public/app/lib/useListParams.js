/**
 * List state (search, tags, sort, page) lives in the hash query string so
 * views are shareable and survive refresh (§7.4). Updates use replaceQuery so
 * typing in a filter doesn't flood browser history.
 */
import { route, replaceQuery } from './router.js';

/**
 * @returns {{
 *   params: Record<string, string>,
 *   update: (patch: Record<string, string|number|undefined|null>) => void,
 * }}
 */
export function useListParams() {
  const params = route.value.query;

  /** @param {Record<string, string|number|undefined|null>} patch */
  const update = (patch) => {
    /** @type {Record<string, string|number|undefined|null>} */
    const next = {};
    const current = route.value.query;
    for (const key of Object.keys(current)) next[key] = current[key];
    for (const key of Object.keys(patch)) next[key] = patch[key];
    replaceQuery(next);
  };

  return { params: params, update: update };
}
