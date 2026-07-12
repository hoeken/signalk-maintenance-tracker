/**
 * Thin client for signalk-stowage-mgmt's REST API (docs/inventory-interaction.md).
 *
 * Used only for the write path — decrementing stock when a task with linked
 * consumables is marked complete. That call originates from an already-
 * authenticated request to *our* API (POST /tasks/:slug/logs), so it forwards
 * the caller's own auth headers (cookie/authorization) rather than holding
 * any credentials of its own — SignalK gates access to stowage-mgmt's API the
 * same way it gates ours (§9 in this plugin's spec).
 *
 * Reads used purely for UI (parts picker autocomplete, stock badges) are
 * intentionally NOT here — those are simple same-origin fetches made
 * directly from the frontend, since the browser already carries the session.
 */

/** Error thrown when stowage-mgmt is unreachable or not installed — the
 * normal case a caller should treat as "nothing to show", not a failure. */
export class StowageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StowageUnavailableError';
  }
}

/** Error thrown when stowage-mgmt IS reachable but the request failed in a
 * way that indicates a real problem (item not found, split item, 5xx, bad
 * auth) — a caller should surface this rather than fail silently. */
export class StowageRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StowageRequestError';
  }
}

export interface StowageItemPlacement {
  id: string;
  location_id: string | null;
  location_name: string | null;
  quantity: number;
}

export interface StowageItem {
  id: string;
  name: string;
  actual_quantity: number;
  target_quantity: number | null;
  /** Non-empty means the item's stock is split across locations. Consuming
   * from a split item requires the caller to say which placement(s) it came
   * from — see consumeFromPlacements — since only a person can know that
   * (docs/inventory-interaction.md: stowage-mgmt's own maintainer rejected
   * an auto-pick-a-placement endpoint for exactly this reason). */
  placements: StowageItemPlacement[];
}

/** One location's contribution to consuming a split item — quantity taken
 * FROM that placement, not the placement's resulting total. */
export interface PlacementAllocation {
  placement_id: string;
  quantity: number;
}

export interface StowageClientOptions {
  /** e.g. http://127.0.0.1:3000/plugins/signalk-stowage-mgmt/api */
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class StowageClient {
  constructor(private opts: StowageClientOptions) {}

  private get fetchImpl(): typeof fetch {
    return this.opts.fetchImpl ?? fetch;
  }

  private async request(
    path: string,
    init: RequestInit,
    forwardHeaders: Record<string, string>,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...forwardHeaders },
      });
    } catch (err) {
      // fetch throws on network errors (connection refused, DNS failure,
      // etc.) — that's the "stowage-mgmt isn't installed/running" case.
      throw new StowageUnavailableError(
        `Could not reach signalk-stowage-mgmt: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // A 404 on GET /items (the unfiltered collection route, always exists
    // if the plugin is mounted) unambiguously means the plugin isn't
    // installed — unlike a 404 on a specific item id, which is ambiguous
    // between "no such item" and "route doesn't exist at all" and so gets
    // its own disambiguation logic in getItem instead of being handled here.
    if (res.status === 404 && path === '/items') {
      throw new StowageUnavailableError(
        'signalk-stowage-mgmt API not found — plugin likely not installed',
      );
    }
    return res;
  }

  /** All items. stowage-mgmt now has a `?q=` search param (added in
   * v0.8.2, closing BoatHacks/signalk-stowage-mgmt#16), but this client
   * doesn't use it: callers here (consumeForTask/consumeFromPlacements) only
   * ever need one specific item by id, not a name search — see getItem.
   * The frontend picker's use case (search-as-you-type) is deliberately
   * unchanged too: it already caches one shared unfiltered item list for
   * both the picker and the stock badges (docs/inventory-interaction.md),
   * so switching the picker to per-keystroke server-side search would trade
   * a single cheap poll for many small ones — not a win at the scale of a
   * boat's inventory. */
  async listItems(
    forwardHeaders: Record<string, string> = {},
  ): Promise<StowageItem[]> {
    const res = await this.request('/items', { method: 'GET' }, forwardHeaders);
    if (!res.ok) {
      throw new StowageRequestError(
        `Failed to list stowage-mgmt items: HTTP ${res.status}`,
      );
    }
    return (await res.json()) as StowageItem[];
  }

  /**
   * A single item by id, via `GET /items/:id` (added in stowage-mgmt v0.8.2,
   * closing BoatHacks/signalk-stowage-mgmt#16 — this client fetched the
   * *entire* item list to find one before that existed). Returns null (not
   * an error) if the item genuinely doesn't exist.
   *
   * A 404 here is ambiguous by status code alone: it's stowage-mgmt's own
   * "no such item" response if the plugin is running, but SignalK's generic
   * 404 handler answers the same way if the plugin isn't mounted at all —
   * those two only differ in body shape (stowage-mgmt's own handler returns
   * its documented `{ error: {...} }` JSON; SignalK's fallback doesn't), so
   * that's what disambiguates them here rather than status code alone.
   */
  async getItem(
    itemId: string,
    forwardHeaders: Record<string, string> = {},
  ): Promise<StowageItem | null> {
    const res = await this.request(
      `/items/${encodeURIComponent(itemId)}`,
      { method: 'GET' },
      forwardHeaders,
    );
    if (res.status === 404) {
      let body: unknown = null;
      try {
        body = await res.clone().json();
      } catch {
        // not JSON -> not stowage-mgmt's own not-found response
      }
      if (body && typeof body === 'object' && 'error' in body) {
        return null; // stowage-mgmt itself says: no such item
      }
      throw new StowageUnavailableError(
        'signalk-stowage-mgmt API not found — plugin likely not installed',
      );
    }
    if (!res.ok) {
      throw new StowageRequestError(
        `Failed to fetch stowage-mgmt item ${itemId}: HTTP ${res.status}`,
      );
    }
    return (await res.json()) as StowageItem;
  }

  /**
   * Decrements a non-split item's stock by `qty` (floored at 0) to record
   * consumption for a completed maintenance task, and returns the updated
   * item.
   *
   * Throws StowageRequestError if the item can't be found or is split
   * across locations — for a split item, use consumeFromPlacements with a
   * caller-supplied (i.e. person-chosen) allocation instead; this method
   * deliberately never guesses which placement to draw down.
   */
  async consumeForTask(
    itemId: string,
    qty: number,
    note: string,
    forwardHeaders: Record<string, string> = {},
  ): Promise<StowageItem> {
    const item = await this.getItem(itemId, forwardHeaders);
    if (!item) {
      throw new StowageRequestError(
        `stowage-mgmt item ${itemId} not found (may have been deleted)`,
      );
    }
    if (item.placements.length > 0) {
      throw new StowageRequestError(
        `stowage-mgmt item "${item.name}" is split across locations — needs a location allocation, not a plain quantity`,
      );
    }
    const nextQuantity = Math.max(0, item.actual_quantity - qty);
    const res = await this.request(
      `/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ actual_quantity: nextQuantity, note }),
      },
      forwardHeaders,
    );
    if (!res.ok) {
      throw new StowageRequestError(
        `Failed to update stowage-mgmt item ${itemId}: HTTP ${res.status}`,
      );
    }
    return (await res.json()) as StowageItem;
  }

  /**
   * Decrements a split item's stock across one or more placements, per a
   * caller-supplied allocation (docs/inventory-interaction.md — the person
   * completing the task picks which location(s) it came from; this method
   * does not choose for them). Validates the whole allocation against a
   * fresh read of the item's current placements *before* changing anything
   * (all-or-nothing), then applies each placement update in turn via
   * stowage-mgmt's `PATCH /items/:id/placements/:placementId`, which keeps
   * the item's overall actual_quantity in sync and logs each change like an
   * ordinary quantity edit.
   *
   * Throws StowageRequestError if the item can't be found, an allocation
   * references a placement the item doesn't have (e.g. it moved since the
   * allocation was chosen), an allocation quantity isn't positive, or an
   * allocation asks for more than that placement currently holds.
   */
  async consumeFromPlacements(
    itemId: string,
    allocations: PlacementAllocation[],
    note: string,
    forwardHeaders: Record<string, string> = {},
  ): Promise<StowageItem> {
    if (!allocations.length) {
      throw new StowageRequestError(
        `No location allocation given for stowage-mgmt item ${itemId}`,
      );
    }
    const item = await this.getItem(itemId, forwardHeaders);
    if (!item) {
      throw new StowageRequestError(
        `stowage-mgmt item ${itemId} not found (may have been deleted)`,
      );
    }
    const placementsById = new Map(item.placements.map((p) => [p.id, p]));
    for (const alloc of allocations) {
      const placement = placementsById.get(alloc.placement_id);
      if (!placement) {
        throw new StowageRequestError(
          `stowage-mgmt item "${item.name}" has no placement ${alloc.placement_id} (it may have moved)`,
        );
      }
      if (!(alloc.quantity > 0)) {
        throw new StowageRequestError(
          `Invalid allocation quantity for "${item.name}"`,
        );
      }
      if (alloc.quantity > placement.quantity) {
        throw new StowageRequestError(
          `Not enough "${item.name}" at ${placement.location_name ?? 'that location'} (have ${placement.quantity}, need ${alloc.quantity})`,
        );
      }
    }
    let updated = item;
    for (const alloc of allocations) {
      const placement = placementsById.get(alloc.placement_id)!;
      const nextQuantity = placement.quantity - alloc.quantity;
      const res = await this.request(
        `/items/${encodeURIComponent(itemId)}/placements/${encodeURIComponent(alloc.placement_id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ quantity: nextQuantity, note }),
        },
        forwardHeaders,
      );
      if (!res.ok) {
        throw new StowageRequestError(
          `Failed to update a placement of "${item.name}": HTTP ${res.status}`,
        );
      }
      updated = (await res.json()) as StowageItem;
    }
    return updated;
  }
}
