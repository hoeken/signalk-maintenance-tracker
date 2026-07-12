import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { TaskFormModal } from '../../public/app/components/TaskFormModal.js';
import { mockFetch, makeTask } from './helpers.js';

const ITEMS_ROUTE = (items) => ({
  match: (m, u) =>
    m === 'GET' && u.indexOf('/signalk-stowage-mgmt/items') !== -1,
  body: items,
});
const TAGS_ROUTE = {
  match: (m, u) => m === 'GET' && u.indexOf('/api/tags') !== -1,
  body: { data: [] },
};

describe('TaskFormModal — consumables (docs/inventory-interaction.md)', () => {
  it('includes an added part in the saved task input', async () => {
    const fn = mockFetch([
      TAGS_ROUTE,
      ITEMS_ROUTE([
        {
          id: 'item-filter',
          name: 'Oil filter',
          actual_quantity: 3,
          target_quantity: 2,
          placements: [],
        },
      ]),
      {
        match: (m, u) => m === 'POST' && u.indexOf('/api/tasks') !== -1,
        status: 201,
        body: { slug: 'oil-change' },
      },
    ]);
    const onClose = vi.fn();
    render(html`<${TaskFormModal} task=${null} onClose=${onClose} />`);

    fireEvent.input(screen.getByLabelText('Name'), {
      target: { value: 'Oil change' },
    });

    const search = screen.getByPlaceholderText(
      'Search stowage-mgmt items to add',
    );
    fireEvent.focus(search);
    fireEvent.input(search, { target: { value: 'oil' } });
    await waitFor(() => expect(screen.getByText('Oil filter')).toBeTruthy());
    fireEvent.mouseDown(screen.getByText('Oil filter'));

    fireEvent.submit(document.getElementById('task-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    const body = JSON.parse(call[1].body);
    expect(body.consumables).toEqual([
      { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
    ]);
  });

  it('prefills already-linked consumables when editing a task', () => {
    mockFetch([TAGS_ROUTE, ITEMS_ROUTE([])]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
      ],
    });
    render(html`<${TaskFormModal} task=${task} onClose=${() => {}} />`);
    expect(screen.getByText('Oil filter')).toBeTruthy();
  });

  it('rejects a zero quantity before saving', async () => {
    mockFetch([TAGS_ROUTE, ITEMS_ROUTE([])]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
      ],
    });
    render(html`<${TaskFormModal} task=${task} onClose=${() => {}} />`);
    fireEvent.input(
      screen.getByLabelText('Quantity per service for Oil filter'),
      { target: { value: '0' } },
    );
    fireEvent.submit(document.getElementById('task-form'));
    await waitFor(() =>
      expect(
        screen.getByText('Each linked part needs a quantity greater than 0.'),
      ).toBeTruthy(),
    );
  });
});
