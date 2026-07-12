/**
 * signalk-stowage-mgmt item discovery, for the consumables picker (task
 * editor) and stock badges (list/detail). Same-origin fetch straight to
 * stowage-mgmt's own API — deliberately NOT proxied through our backend,
 * since the browser already carries the session cookie stowage-mgmt needs
 * (docs/inventory-interaction.md: "loose coupling via REST, not a shared
 * DB"). Our backend's StowageClient (src/stowage/client.ts) is a separate,
 * unrelated thing used only for the write path on task completion.
 */
import { useResource } from './resource.js';

export const STOWAGE_API_BASE = '/plugins/signalk-stowage-mgmt/api';

/** @typedef {{ id: string, location_id: string|null, location_name: string|null, quantity: number }} StowagePlacement */
/** @typedef {{ id: string, name: string, actual_quantity: number, target_quantity: number|null, placements: StowagePlacement[] }} StowageItem */

/** Thrown for a 404 on the API root — stowage-mgmt isn't installed/mounted.
 * Distinct from other failures so callers can decide whether that's worth
 * surfacing (docs/inventory-interaction.md's discovery/failure-handling
 * decision): a picker shows this inline; a task that already has linked
 * consumables treats it as a real problem and toasts instead. */
export class StowageUnavailableError extends Error {}

/**
 * All stowage-mgmt items. stowage-mgmt has no search/filter query params
 * (mirrors the backend StowageClient), so callers filter client-side.
 * @returns {Promise<StowageItem[]>}
 */
async function fetchItems() {
  let res;
  try {
    res = await fetch(STOWAGE_API_BASE + '/items', {
      credentials: 'same-origin',
    });
  } catch (err) {
    throw new StowageUnavailableError(
      'Could not reach signalk-stowage-mgmt: ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  if (res.status === 404) {
    throw new StowageUnavailableError(
      'signalk-stowage-mgmt API not found — plugin likely not installed',
    );
  }
  if (!res.ok) {
    throw new Error('Failed to list stowage-mgmt items (' + res.status + ')');
  }
  return res.json();
}

/**
 * Polled like the rest of the app's live data (§7.6) so stock badges stay
 * current without a manual refresh.
 * @returns {import('./resource.js').ResourceState<StowageItem[]>}
 */
export function useStowageItems() {
  return useResource('stowage-items', fetchItems, { refetchInterval: 5000 });
}

/**
 * Worst-case stock status across a set of linked consumables, for the
 * summary badge: any item at 0 -> 'out'; any item below its target -> 'low';
 * otherwise 'ok'. Items stowage-mgmt no longer has a record of are ignored
 * here — the picker/list separately marks those as stale by name.
 * @param {{ item_id: string, qty_per_service: number }[]} consumables
 * @param {StowageItem[]} items
 * @returns {'out'|'low'|'ok'|null} null when there's nothing to report
 */
export function summarizeStock(consumables, items) {
  if (!consumables || !consumables.length) return null;
  const byId = new Map(items.map((i) => [i.id, i]));
  let worst = /** @type {'out'|'low'|'ok'|null} */ (null);
  for (const c of consumables) {
    const item = byId.get(c.item_id);
    if (!item) continue; // stale link — nothing to score
    if (item.actual_quantity <= 0) return 'out'; // can't get worse
    if (
      item.target_quantity !== null &&
      item.actual_quantity < item.target_quantity
    ) {
      worst = 'low';
    } else if (worst === null) {
      worst = 'ok';
    }
  }
  return worst;
}
