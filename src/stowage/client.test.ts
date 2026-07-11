import { describe, expect, it, vi } from 'vitest';
import {
  StowageClient,
  StowageItem,
  StowageRequestError,
  StowageUnavailableError,
} from './client';

const BASE_URL = 'http://127.0.0.1:3000/plugins/signalk-stowage-mgmt/api';

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
    { location_id: 'loc-1', quantity: 2 },
    { location_id: 'loc-2', quantity: 2 },
  ],
};

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
    it('returns the matching item', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse([OIL_FILTER, SPLIT_ITEM]));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      const item = await client.getItem('item-split');
      expect(item).toEqual(SPLIT_ITEM);
    });

    it('returns null (not an error) when the item is missing', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([OIL_FILTER]));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      const item = await client.getItem('does-not-exist');
      expect(item).toBeNull();
    });
  });

  describe('consumeForTask', () => {
    it('decrements actual_quantity and PATCHes with a note', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse([OIL_FILTER])) // getItem -> listItems
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
        .mockResolvedValueOnce(jsonResponse([OIL_FILTER])) // qty 3
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
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([SPLIT_ITEM]));
      const client = new StowageClient({ baseUrl: BASE_URL, fetchImpl });
      await expect(
        client.consumeForTask('item-split', 1, 'note'),
      ).rejects.toThrow(StowageRequestError);
      expect(fetchImpl).toHaveBeenCalledTimes(1); // only the listItems lookup
    });

    it('throws StowageRequestError when the item is missing', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
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
});
