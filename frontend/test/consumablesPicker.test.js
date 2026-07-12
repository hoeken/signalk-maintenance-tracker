import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { ConsumablesPicker } from '../../public/app/components/ConsumablesPicker.js';
import { mockFetch } from './helpers.js';

const ITEMS_ROUTE = (items) => ({
  match: (m, u) =>
    m === 'GET' && u.indexOf('/signalk-stowage-mgmt/api/items') !== -1,
  body: items,
});

describe('ConsumablesPicker (docs/inventory-interaction.md)', () => {
  it('lists already-linked items with an editable quantity', () => {
    mockFetch([ITEMS_ROUTE([])]);
    render(
      html`<${ConsumablesPicker}
        value=${[
          {
            item_id: 'item-filter',
            item_name: 'Oil filter',
            qty_per_service: 2,
          },
        ]}
        onChange=${() => {}}
      />`,
    );
    expect(screen.getByText('Oil filter')).toBeTruthy();
    expect(
      /** @type {HTMLInputElement} */ (
        screen.getByLabelText('Quantity per service for Oil filter')
      ).value,
    ).toBe('2');
  });

  it('adds an item from the search combo', async () => {
    mockFetch([
      ITEMS_ROUTE([
        {
          id: 'item-filter',
          name: 'Oil filter',
          actual_quantity: 3,
          target_quantity: 2,
          placements: [],
        },
      ]),
    ]);
    const onChange = vi.fn();
    render(html`<${ConsumablesPicker} value=${[]} onChange=${onChange} />`);
    const input = screen.getByPlaceholderText(
      'Search stowage-mgmt items to add',
    );
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: 'oil' } });
    await waitFor(() => expect(screen.getByText('Oil filter')).toBeTruthy());
    fireEvent.mouseDown(screen.getByText('Oil filter'));
    expect(onChange).toHaveBeenCalledWith([
      { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
    ]);
  });

  it('removes a linked item', () => {
    mockFetch([ITEMS_ROUTE([])]);
    const onChange = vi.fn();
    render(
      html`<${ConsumablesPicker}
        value=${[
          {
            item_id: 'item-filter',
            item_name: 'Oil filter',
            qty_per_service: 1,
          },
        ]}
        onChange=${onChange}
      />`,
    );
    fireEvent.click(screen.getByLabelText('Remove Oil filter'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('edits the quantity of a linked item', () => {
    mockFetch([ITEMS_ROUTE([])]);
    const onChange = vi.fn();
    render(
      html`<${ConsumablesPicker}
        value=${[
          {
            item_id: 'item-filter',
            item_name: 'Oil filter',
            qty_per_service: 1,
          },
        ]}
        onChange=${onChange}
      />`,
    );
    fireEvent.input(
      screen.getByLabelText('Quantity per service for Oil filter'),
      { target: { value: '5' } },
    );
    expect(onChange).toHaveBeenCalledWith([
      { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 5 },
    ]);
  });

  it('shows an inline notice and hides the add-combo when stowage-mgmt is unreachable', async () => {
    mockFetch([]); // unmocked -> 404 -> StowageUnavailableError
    render(
      html`<${ConsumablesPicker}
        value=${[
          {
            item_id: 'item-filter',
            item_name: 'Oil filter',
            qty_per_service: 1,
          },
        ]}
        onChange=${() => {}}
      />`,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Could not reach signalk-stowage-mgmt/),
      ).toBeTruthy(),
    );
    // existing link is still visible/editable
    expect(screen.getByText('Oil filter')).toBeTruthy();
    expect(
      screen.queryByPlaceholderText('Search stowage-mgmt items to add'),
    ).toBeNull();
  });

  it('excludes already-selected items from the search matches', async () => {
    mockFetch([
      ITEMS_ROUTE([
        {
          id: 'item-filter',
          name: 'Oil filter',
          actual_quantity: 3,
          target_quantity: 2,
          placements: [],
        },
      ]),
    ]);
    render(
      html`<${ConsumablesPicker}
        value=${[
          {
            item_id: 'item-filter',
            item_name: 'Oil filter',
            qty_per_service: 1,
          },
        ]}
        onChange=${() => {}}
      />`,
    );
    const input = screen.getByPlaceholderText(
      'Search stowage-mgmt items to add',
    );
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: '' } });
    await new Promise((r) => setTimeout(r, 10));
    // only appears once, in the selected-items list, not in the combo
    expect(screen.getAllByText('Oil filter')).toHaveLength(1);
  });
});
