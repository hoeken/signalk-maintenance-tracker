import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { StockBadge } from '../../public/app/components/StockBadge.js';
import { toasts } from '../../public/app/lib/toasts.js';
import { mockFetch } from './helpers.js';

const CONSUMABLES = [
  { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
];

describe('StockBadge (docs/inventory-interaction.md)', () => {
  it('renders nothing for a task with no linked consumables', async () => {
    mockFetch([]);
    const { container } = render(html`<${StockBadge} consumables=${[]} />`);
    // give any stray effects a tick, then assert nothing rendered
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('');
  });

  it('renders "In stock" when the linked item is at/above target', async () => {
    mockFetch([
      {
        match: (m, u) =>
          m === 'GET' && u.indexOf('/signalk-stowage-mgmt/api/items') !== -1,
        body: [
          {
            id: 'item-filter',
            name: 'Oil filter',
            actual_quantity: 3,
            target_quantity: 2,
            placements: [],
          },
        ],
      },
    ]);
    render(html`<${StockBadge} consumables=${CONSUMABLES} />`);
    await waitFor(() => expect(screen.getByText('In stock')).toBeTruthy());
  });

  it('renders "Out of stock" when the linked item is at zero', async () => {
    mockFetch([
      {
        match: (m, u) =>
          m === 'GET' && u.indexOf('/signalk-stowage-mgmt/api/items') !== -1,
        body: [
          {
            id: 'item-filter',
            name: 'Oil filter',
            actual_quantity: 0,
            target_quantity: 2,
            placements: [],
          },
        ],
      },
    ]);
    render(html`<${StockBadge} consumables=${CONSUMABLES} />`);
    await waitFor(() => expect(screen.getByText('Out of stock')).toBeTruthy());
  });

  it('stays silent (no badge, no toast) when stowage-mgmt is simply not installed (404)', async () => {
    mockFetch([]); // no route configured -> helper's fallback 404
    render(html`<${StockBadge} consumables=${CONSUMABLES} />`);
    // let the fetch + effect settle
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText('In stock')).toBeNull();
    expect(screen.queryByText('Out of stock')).toBeNull();
    expect(screen.queryByText('Low stock')).toBeNull();
    expect(toasts.value).toEqual([]);
  });

  it('toasts when stowage-mgmt is reachable but the request fails for a real reason', async () => {
    mockFetch([
      {
        match: (m, u) =>
          m === 'GET' && u.indexOf('/signalk-stowage-mgmt/api/items') !== -1,
        status: 500,
        body: { error: { code: 'internal', message: 'boom' } },
      },
    ]);
    render(html`<${StockBadge} consumables=${CONSUMABLES} />`);
    await waitFor(() => expect(toasts.value.length).toBe(1));
    expect(toasts.value[0].kind).toBe('error');
  });
});
