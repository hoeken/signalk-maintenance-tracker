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
  location_id: string | null;
  quantity: number;
}

export interface StowageItem {
  id: string;
  name: string;
  actual_quantity: number;
  target_quantity: number | null;
  /** Non-empty means the item's stock is split across locations — see
   * signalk-stowage-mgmt's own docs; actual_quantity can only be changed via
   * its /split endpoint in that case, which this client does not support. */
  placements: StowageItemPlacement[];
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
    // A 404 on stowage-mgmt's own API root/route (as opposed to a 404 for a
    // specific item we asked for by id) means the plugin isn't mounted —
    // also "unavailable", not "a real problem". Individual not-found lookups
    // are handled by callers, since they have the context to tell the two
    // apart (see getItem).
    if (res.status === 404 && path === '/items') {
      throw new StowageUnavailableError(
        'signalk-stowage-mgmt API not found — plugin likely not installed',
      );
    }
    return res;
  }

  /** All items — stowage-mgmt has no search/filter query params, so callers
   * (e.g. a picker) filter client-side. */
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

  /** No GET /items/:id in stowage-mgmt's API — fetch the list and find it.
   * Returns null (not an error) if the item genuinely doesn't exist. */
  async getItem(
    itemId: string,
    forwardHeaders: Record<string, string> = {},
  ): Promise<StowageItem | null> {
    const items = await this.listItems(forwardHeaders);
    return items.find((i) => i.id === itemId) ?? null;
  }

  /**
   * Decrements an item's stock by `qty` (floored at 0) to record consumption
   * for a completed maintenance task, and returns the updated item.
   *
   * Throws StowageRequestError if the item can't be found or is split across
   * locations (stock changes for split items must go through stowage-mgmt's
   * own /split endpoint, which this client intentionally doesn't attempt —
   * see docs/inventory-interaction.md).
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
        `stowage-mgmt item "${item.name}" is split across locations — cannot auto-decrement`,
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
}
