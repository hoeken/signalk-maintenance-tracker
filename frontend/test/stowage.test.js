import { describe, it, expect } from 'vitest';
import { summarizeStock } from '../../public/app/api/stowage.js';

/** @type {import('../../public/app/api/stowage.js').StowageItem} */
const FILTER = {
  id: 'item-filter',
  name: 'Oil filter',
  actual_quantity: 3,
  target_quantity: 2,
  placements: [],
};
/** @type {import('../../public/app/api/stowage.js').StowageItem} */
const OIL = {
  id: 'item-oil',
  name: 'Engine oil',
  actual_quantity: 0,
  target_quantity: 5,
  placements: [],
};
/** @type {import('../../public/app/api/stowage.js').StowageItem} */
const ZINC = {
  id: 'item-zinc',
  name: 'Zincs',
  actual_quantity: 1,
  target_quantity: 4,
  placements: [],
};

describe('summarizeStock (docs/inventory-interaction.md)', () => {
  it('returns null with no linked consumables', () => {
    expect(summarizeStock([], [FILTER])).toBeNull();
  });

  it('returns "ok" when every linked item is at or above target', () => {
    const status = summarizeStock(
      [{ item_id: 'item-filter', qty_per_service: 1 }],
      [FILTER],
    );
    expect(status).toBe('ok');
  });

  it('returns "low" when a linked item is below target but not at zero', () => {
    const status = summarizeStock(
      [{ item_id: 'item-zinc', qty_per_service: 1 }],
      [ZINC],
    );
    expect(status).toBe('low');
  });

  it('returns "out" when any linked item is at zero, even if others are fine', () => {
    const status = summarizeStock(
      [
        { item_id: 'item-filter', qty_per_service: 1 },
        { item_id: 'item-oil', qty_per_service: 5 },
      ],
      [FILTER, OIL],
    );
    expect(status).toBe('out');
  });

  it('ignores links to items stowage-mgmt no longer has (stale link)', () => {
    const status = summarizeStock(
      [{ item_id: 'does-not-exist', qty_per_service: 1 }],
      [FILTER],
    );
    expect(status).toBeNull();
  });

  it('an item with no target_quantity set is never "low", only "ok" or "out"', () => {
    const noTarget = { ...FILTER, target_quantity: null, actual_quantity: 1 };
    expect(
      summarizeStock(
        [{ item_id: noTarget.id, qty_per_service: 1 }],
        [noTarget],
      ),
    ).toBe('ok');
  });
});
