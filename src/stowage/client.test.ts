import { describe, expect, it, vi } from 'vitest';
import {
  StowageClient,
  StowageItem,
  StowageRequestError,
  StowageUnavailableError,
} from './client';

const BASE_URL = 'http://127.0.0.1:3000/plugins/signalk-stowage-mgmt';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const OIL_FILTER: StowageItem = {
  id: 'item-oil-filter',
  name: 'Oil filter',
  actual_quantity: 3,
  target_quantity: 2,
  placements: [],
};

const SPLIT_ITEM: StowageItem = {
  id: 'item-split',
  name: 'Zincs',
  actual_quantity: 4,
  target_quantity: null,
  placements: [
    {
      id: 'placement-1',
      location_id: 'loc-1',
      location_name: 'Engine room',
      quantity: 2,
    },
    {
      id: 'placement-2',
      location_id: 'loc-2',
      location_name: 'V-berth',
      quantity: 2,
    },
  ],
};

function notFoundJson(message = 'not found'): Response {
  return jsonResponse({ error: { code: 'not_found', message } }, 404);
}

describe('StowageClient', () => {
  describe('listItems', () => {
    it('returns items on success', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([OIL_FILTER]));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      const items = await client.listItems();
      expect(items).toEqual([OIL_FILTER]);
      expect(fetchImpl).toHaveBeenCalledWith(
        `${BASE_URL}/items`,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('forwards auth headers from the caller', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await client.listItems({ cookie: 'JSESSIONID=abc' });
      expect(fetchImpl).toHaveBeenCalledWith(
        `${BASE_URL}/items`,
        expect.objectContaining({
          headers: expect.objectContaining({ cookie: 'JSESSIONID=abc' }),
        }),
      );
    });

    it('throws StowageUnavailableError on a network failure', async () => {
      const fetchImpl = vi
        .fn()
        .mockRejectedValue(new TypeError('fetch failed'));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(client.listItems()).rejects.toThrow(StowageUnavailableError);
    });

    it('throws StowageUnavailableError when /items itself 404s (plugin not installed)', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(new Response('not found', { status: 404 }));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(client.listItems()).rejects.toThrow(StowageUnavailableError);
    });

    it('throws StowageRequestError on a 500', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(new Response('boom', { status: 500 }));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(client.listItems()).rejects.toThrow(StowageRequestError);
    });
  });

  describe('getItem', () => {
    it('fetches the item directly by id', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SPLIT_ITEM));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      const item = await client.getItem('item-split');
      expect(item).toEqual(SPLIT_ITEM);
      expect(fetchImpl).toHaveBeenCalledWith(
        `${BASE_URL}/items/item-split`,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns null (not an error) when stowage-mgmt reports the item missing', async () => {
      // stowage-mgmt's own 404 handler ran and returned its documented
      // {error:{...}} JSON body — a real "no such item", not an outage.
      const fetchImpl = vi.fn().mockResolvedValue(notFoundJson());
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      const item = await client.getItem('does-not-exist');
      expect(item).toBeNull();
    });

    it("throws StowageUnavailableError when a 404 is not stowage-mgmt's own JSON error (route likely unmounted)", async () => {
      // SignalK's generic fallback 404 — plain text, not stowage-mgmt's
      // documented error shape — which is what makes this ambiguous case
      // resolve to "unavailable" rather than "item not found".
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(new Response('Cannot GET /…', { status: 404 }));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(client.getItem('item-split')).rejects.toThrow(
        StowageUnavailableError,
      );
    });

    it('throws StowageRequestError on a 500', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(new Response('boom', { status: 500 }));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(client.getItem('item-split')).rejects.toThrow(
        StowageRequestError,
      );
    });

    it('throws StowageUnavailableError on a network failure', async () => {
      const fetchImpl = vi
        .fn()
        .mockRejectedValue(new TypeError('fetch failed'));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(client.getItem('item-split')).rejects.toThrow(
        StowageUnavailableError,
      );
    });
  });

  describe('consumeForTask', () => {
    it('decrements actual_quantity and PATCHes with a note', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(OIL_FILTER)) // getItem
        .mockResolvedValueOnce(
          jsonResponse({ ...OIL_FILTER, actual_quantity: 2 }),
        ); // PATCH
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      const updated = await client.consumeForTask(
        'item-oil-filter',
        1,
        'Used for maintenance task: Oil change (2026-07-11)',
      );
      expect(updated.actual_quantity).toBe(2);
      expect(fetchImpl).toHaveBeenLastCalledWith(
        `${BASE_URL}/items/item-oil-filter`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            actual_quantity: 2,
            note: 'Used for maintenance task: Oil change (2026-07-11)',
          }),
        }),
      );
    });

    it('floors the resulting quantity at 0', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(OIL_FILTER)) // qty 3
        .mockResolvedValueOnce(
          jsonResponse({ ...OIL_FILTER, actual_quantity: 0 }),
        );
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await client.consumeForTask('item-oil-filter', 99, 'note');
      const patchCall = fetchImpl.mock.calls[1];
      expect(JSON.parse(patchCall[1].body)).toEqual({
        actual_quantity: 0,
        note: 'note',
      });
    });

    it('throws StowageRequestError for a split item without calling PATCH', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SPLIT_ITEM));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(
        client.consumeForTask('item-split', 1, 'note'),
      ).rejects.toThrow(StowageRequestError);
      expect(fetchImpl).toHaveBeenCalledTimes(1); // only the getItem lookup
    });

    it('throws StowageRequestError when the item is missing', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(notFoundJson());
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(
        client.consumeForTask('does-not-exist', 1, 'note'),
      ).rejects.toThrow(StowageRequestError);
    });

    it('propagates StowageUnavailableError from the lookup', async () => {
      const fetchImpl = vi
        .fn()
        .mockRejectedValue(new TypeError('fetch failed'));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(
        client.consumeForTask('item-oil-filter', 1, 'note'),
      ).rejects.toThrow(StowageUnavailableError);
    });
  });

  describe('consumeFromPlacements', () => {
    it('decrements each allocated placement and returns the final response', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(SPLIT_ITEM)) // getItem
        .mockResolvedValueOnce(
          jsonResponse({
            ...SPLIT_ITEM,
            actual_quantity: 3,
            placements: [
              { ...SPLIT_ITEM.placements[0], quantity: 1 },
              SPLIT_ITEM.placements[1],
            ],
          }),
        ) // PATCH placement-1
        .mockResolvedValueOnce(
          jsonResponse({
            ...SPLIT_ITEM,
            actual_quantity: 2,
            placements: [
              { ...SPLIT_ITEM.placements[0], quantity: 1 },
              { ...SPLIT_ITEM.placements[1], quantity: 1 },
            ],
          }),
        ); // PATCH placement-2
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      const updated = await client.consumeFromPlacements(
        'item-split',
        [
          { placement_id: 'placement-1', quantity: 1 },
          { placement_id: 'placement-2', quantity: 1 },
        ],
        'Used for maintenance task: Zinc replacement (2026-07-11)',
      );
      expect(updated.actual_quantity).toBe(2);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(fetchImpl).toHaveBeenNthCalledWith(
        2,
        `${BASE_URL}/items/item-split/placements/placement-1`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            quantity: 1, // 2 - 1
            note: 'Used for maintenance task: Zinc replacement (2026-07-11)',
          }),
        }),
      );
      expect(fetchImpl).toHaveBeenNthCalledWith(
        3,
        `${BASE_URL}/items/item-split/placements/placement-2`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            quantity: 1,
            note: 'Used for maintenance task: Zinc replacement (2026-07-11)',
          }),
        }),
      );
    });

    it('validates the whole allocation before making any change (all-or-nothing)', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SPLIT_ITEM));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(
        client.consumeFromPlacements(
          'item-split',
          [
            { placement_id: 'placement-1', quantity: 1 }, // fine
            { placement_id: 'placement-2', quantity: 99 }, // too much
          ],
          'note',
        ),
      ).rejects.toThrow(StowageRequestError);
      // only the initial getItem lookup — no PATCH calls at all
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('rejects an allocation quantity greater than what the placement holds', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SPLIT_ITEM));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(
        client.consumeFromPlacements(
          'item-split',
          [{ placement_id: 'placement-1', quantity: 3 }], // only 2 there
          'note',
        ),
      ).rejects.toThrow(StowageRequestError);
    });

    it('rejects an allocation referencing a placement the item does not have', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SPLIT_ITEM));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(
        client.consumeFromPlacements(
          'item-split',
          [{ placement_id: 'does-not-exist', quantity: 1 }],
          'note',
        ),
      ).rejects.toThrow(StowageRequestError);
    });

    it('rejects a non-positive allocation quantity', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SPLIT_ITEM));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(
        client.consumeFromPlacements(
          'item-split',
          [{ placement_id: 'placement-1', quantity: 0 }],
          'note',
        ),
      ).rejects.toThrow(StowageRequestError);
    });

    it('rejects an empty allocation list', async () => {
      const fetchImpl = vi.fn();
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(
        client.consumeFromPlacements('item-split', [], 'note'),
      ).rejects.toThrow(StowageRequestError);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('throws StowageRequestError when the item is missing', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(notFoundJson());
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(
        client.consumeFromPlacements(
          'does-not-exist',
          [{ placement_id: 'placement-1', quantity: 1 }],
          'note',
        ),
      ).rejects.toThrow(StowageRequestError);
    });
  });
});
