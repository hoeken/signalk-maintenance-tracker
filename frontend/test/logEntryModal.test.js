import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { LogEntryModal } from '../../public/app/components/LogEntryModal.js';
import { toasts } from '../../public/app/lib/toasts.js';
import { mockFetch, makeTask } from './helpers.js';

/** A stowage-mgmt GET /items response with the given items. */
function stowageItemsRoute(items) {
  return {
    match: (m, u) =>
      m === 'GET' && u.indexOf('/signalk-stowage-mgmt/items') !== -1,
    body: items,
  };
}

/** A non-split stowage-mgmt item. */
function stockItem(id, name, actual_quantity) {
  return {
    id,
    name,
    actual_quantity,
    target_quantity: null,
    placements: [],
  };
}

function logPostRoute() {
  return {
    match: (m, u) =>
      m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
    status: 201,
    body: { id: 9, task_slug: 'engine-oil-change' },
  };
}

/** The JSON body of the (first) POST the fetch mock saw. */
function postedBody(fn) {
  const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
  return JSON.parse(call[1].body);
}

describe('LogEntryModal — mark complete (§7.5)', () => {
  it('prefills runtime hours from the task current_runtime (plugin API value, §8.4)', () => {
    mockFetch([]);
    render(
      html`<${LogEntryModal}
        task=${makeTask({ current_runtime: 1360 })}
        onClose=${() => {}}
      />`,
    );
    expect(screen.getByLabelText('Runtime hours').value).toBe('1360');
  });

  it('rounds the prefilled runtime to 0.1 h like the rest of the UI', () => {
    mockFetch([]);
    render(
      html`<${LogEntryModal}
        task=${makeTask({ current_runtime: 1360.2588 })}
        onClose=${() => {}}
      />`,
    );
    expect(screen.getByLabelText('Runtime hours').value).toBe('1360.3');
  });

  it('shows an empty runtime field for tasks without a runtime path', () => {
    mockFetch([]);
    render(
      html`<${LogEntryModal}
        task=${makeTask({ runtime_path: null, current_runtime: null })}
        onClose=${() => {}}
      />`,
    );
    expect(screen.getByLabelText('Runtime hours').value).toBe('');
  });

  it('hides the runtime field entirely when completing a todo', () => {
    mockFetch([]);
    render(
      html`<${LogEntryModal}
        task=${makeTask({
          is_recurring: false,
          runtime_path: null,
          current_runtime: null,
        })}
        onClose=${() => {}}
      />`,
    );
    expect(screen.queryByLabelText('Runtime hours')).toBeNull();
  });

  it('POSTs the log entry and closes', async () => {
    const fn = mockFetch([
      {
        match: (m, u) =>
          m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change' },
      },
    ]);
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${makeTask()} onClose=${onClose} />`);
    fireEvent.input(screen.getByLabelText('Notes (markdown)'), {
      target: { value: 'Replaced filter.' },
    });
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    const body = JSON.parse(call[1].body);
    expect(body.runtime_hours).toBe(1360);
    expect(body.notes).toBe('Replaced filter.');
    expect(body.maintenance_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('edits an existing entry via PUT /logs/:id', async () => {
    const fn = mockFetch([
      {
        match: (m, u) => m === 'PUT' && u.indexOf('/api/logs/7') !== -1,
        body: { id: 7, task_slug: 'engine-oil-change' },
      },
    ]);
    const onClose = vi.fn();
    const entry = {
      id: 7,
      task_id: 1,
      maintenance_date: '2026-07-01T10:00:00.000Z',
      runtime_hours: 1300,
      notes: 'old note',
      logged_by: 'admin',
      created_at: '2026-07-01T10:00:00.000Z',
      task_slug: 'engine-oil-change',
      task_name: 'Engine oil change',
    };
    render(html`<${LogEntryModal} entry=${entry} onClose=${onClose} />`);
    expect(screen.getByLabelText('Runtime hours').value).toBe('1300');
    fireEvent.input(screen.getByLabelText('Notes (markdown)'), {
      target: { value: 'corrected' },
    });
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'PUT');
    expect(JSON.parse(call[1].body).notes).toBe('corrected');
  });

  it('without a task or entry it creates a standalone entry via POST /logs', async () => {
    const fn = mockFetch([
      {
        match: (m, u) => m === 'POST' && u.indexOf('/api/logs') !== -1,
        status: 201,
        body: { id: 12, task_id: null, title: 'Haul out' },
      },
    ]);
    const onClose = vi.fn();
    render(html`<${LogEntryModal} onClose=${onClose} />`);
    expect(screen.getByText('New log entry')).toBeTruthy();
    // no task: nothing with a runtime meter, so no runtime field at all
    expect(screen.queryByLabelText('Runtime hours')).toBeNull();
    // steers people toward Complete on a task for better records
    expect(screen.getByText(/quick log entries not tied/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Title'), {
      target: { value: 'Haul out' },
    });
    fireEvent.input(screen.getByLabelText('Notes (markdown)'), {
      target: { value: 'Bottom paint.' },
    });
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    const body = JSON.parse(call[1].body);
    expect(body.title).toBe('Haul out');
    expect(body.notes).toBe('Bottom paint.');
    expect(body.maintenance_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('blocks a standalone entry without a title', async () => {
    const fn = mockFetch([]);
    const onClose = vi.fn();
    render(html`<${LogEntryModal} onClose=${onClose} />`);
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() =>
      expect(screen.getByText('Title is required.')).toBeTruthy(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(fn.mock.calls.find((c) => c[1] && c[1].method === 'POST')).toBe(
      undefined,
    );
  });

  it('editing a standalone entry shows its title and PUTs the change', async () => {
    const fn = mockFetch([
      {
        match: (m, u) => m === 'PUT' && u.indexOf('/api/logs/12') !== -1,
        body: { id: 12, task_id: null, title: 'Haul out 2026' },
      },
    ]);
    const onClose = vi.fn();
    const entry = {
      id: 12,
      task_id: null,
      title: 'Haul out',
      maintenance_date: '2026-07-01T10:00:00.000Z',
      runtime_hours: null,
      notes: null,
      logged_by: 'admin',
      created_at: '2026-07-01T10:00:00.000Z',
      task_slug: null,
      task_name: null,
    };
    render(html`<${LogEntryModal} entry=${entry} onClose=${onClose} />`);
    expect(screen.getByLabelText('Title').value).toBe('Haul out');
    // the create-time guidance note has no business on an edit
    expect(screen.queryByText(/quick log entries not tied/)).toBeNull();
    fireEvent.input(screen.getByLabelText('Title'), {
      target: { value: 'Haul out 2026' },
    });
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'PUT');
    expect(JSON.parse(call[1].body).title).toBe('Haul out 2026');
  });

  it('does not show a title field when editing a task-linked entry', () => {
    mockFetch([]);
    const entry = {
      id: 7,
      task_id: 1,
      title: null,
      maintenance_date: '2026-07-01T10:00:00.000Z',
      runtime_hours: 1300,
      notes: null,
      logged_by: 'admin',
      created_at: '2026-07-01T10:00:00.000Z',
      task_slug: 'engine-oil-change',
      task_name: 'Engine oil change',
    };
    render(html`<${LogEntryModal} entry=${entry} onClose=${() => {}} />`);
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('does not show the inventory section for a task with no linked consumables', () => {
    mockFetch([]);
    render(html`<${LogEntryModal} task=${makeTask()} onClose=${() => {}} />`);
    expect(screen.queryByText('Inventory Management')).toBeNull();
  });

  it('lists each linked part checked, prefilled with qty_per_service, and shows the stock total', async () => {
    const fn = mockFetch([
      stowageItemsRoute([
        stockItem('item-filter', 'Oil filter', 3),
        stockItem('item-oil', 'Engine oil', 10),
      ]),
      logPostRoute(),
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
        { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 4 },
      ],
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${task} onClose=${onClose} />`);
    expect(screen.getByText('Inventory Management')).toBeTruthy();
    await waitFor(() =>
      expect(
        [...document.querySelectorAll('.consumables-total')].map((el) =>
          el.textContent.replace(/\s+/g, ' ').trim(),
        ),
      ).toEqual(['/ 3', '/ 10']),
    );
    expect(screen.getByLabelText('Oil filter').checked).toBe(true);
    expect(screen.getByLabelText('Quantity of Oil filter used').value).toBe(
      '1',
    );
    expect(screen.getByLabelText('Quantity of Engine oil used').value).toBe(
      '4',
    );
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const body = postedBody(fn);
    expect(body.consume_stock).toBe(true);
    expect(body.consumable_quantities).toEqual([
      { item_id: 'item-filter', quantity: 1 },
      { item_id: 'item-oil', quantity: 4 },
    ]);
  });

  it('colours each stock total like the task detail page', async () => {
    mockFetch([
      stowageItemsRoute([
        stockItem('item-filter', 'Oil filter', 0),
        { ...stockItem('item-oil', 'Engine oil', 5), target_quantity: 8 },
        stockItem('item-zinc', 'Zincs', 6),
      ]),
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
        { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 4 },
        { item_id: 'item-zinc', item_name: 'Zincs', qty_per_service: 2 },
      ],
    });
    render(html`<${LogEntryModal} task=${task} onClose=${() => {}} />`);
    await waitFor(() => expect(screen.getByText('6')).toBeTruthy());
    expect(screen.getByText('0').className).toBe('consumables-stock short');
    expect(screen.getByText('5').className).toBe('consumables-stock low');
    expect(screen.getByText('6').className).toBe('consumables-stock ok');
  });

  it('caps the default quantity to what is in stock', async () => {
    mockFetch([stowageItemsRoute([stockItem('item-oil', 'Engine oil', 2)])]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 4 },
      ],
    });
    render(html`<${LogEntryModal} task=${task} onClose=${() => {}} />`);
    await waitFor(() =>
      expect(screen.getByLabelText('Quantity of Engine oil used').value).toBe(
        '2',
      ),
    );
  });

  it('sends only the checked parts, at the edited quantities', async () => {
    const fn = mockFetch([
      stowageItemsRoute([
        stockItem('item-filter', 'Oil filter', 3),
        stockItem('item-oil', 'Engine oil', 10),
      ]),
      logPostRoute(),
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
        { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 4 },
      ],
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${task} onClose=${onClose} />`);
    await waitFor(() =>
      expect(screen.getByLabelText('Oil filter').disabled).toBe(false),
    );
    fireEvent.click(screen.getByLabelText('Oil filter'));
    expect(screen.getByLabelText('Quantity of Oil filter used').disabled).toBe(
      true,
    );
    fireEvent.input(screen.getByLabelText('Quantity of Engine oil used'), {
      target: { value: '3.5' },
    });
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(postedBody(fn).consumable_quantities).toEqual([
      { item_id: 'item-oil', quantity: 3.5 },
    ]);
  });

  it('unchecking every part sends consume_stock: false', async () => {
    const fn = mockFetch([
      stowageItemsRoute([stockItem('item-filter', 'Oil filter', 3)]),
      logPostRoute(),
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
      ],
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${task} onClose=${onClose} />`);
    await waitFor(() =>
      expect(screen.getByLabelText('Oil filter').disabled).toBe(false),
    );
    fireEvent.click(screen.getByLabelText('Oil filter'));
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const body = postedBody(fn);
    expect(body.consume_stock).toBe(false);
    expect(body.consumable_quantities).toBeUndefined();
  });

  it('blocks a quantity above what is in stock', async () => {
    mockFetch([
      stowageItemsRoute([stockItem('item-filter', 'Oil filter', 3)]),
      logPostRoute(),
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
      ],
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${task} onClose=${onClose} />`);
    await waitFor(() =>
      expect(screen.getByLabelText('Oil filter').disabled).toBe(false),
    );
    fireEvent.input(screen.getByLabelText('Quantity of Oil filter used'), {
      target: { value: '4' },
    });
    expect(screen.getByText('Only 3 in stock.')).toBeTruthy();
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() =>
      expect(screen.getByText(/Only 3 Oil filter in stock/)).toBeTruthy(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables a part with nothing in stock and leaves it out', async () => {
    const fn = mockFetch([
      stowageItemsRoute([
        stockItem('item-filter', 'Oil filter', 0),
        stockItem('item-oil', 'Engine oil', 10),
      ]),
      logPostRoute(),
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
        { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 4 },
      ],
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${task} onClose=${onClose} />`);
    await waitFor(() =>
      expect(screen.getByLabelText('Engine oil').disabled).toBe(false),
    );
    const filter = screen.getByLabelText('Oil filter');
    expect(filter.disabled).toBe(true);
    expect(filter.checked).toBe(false);
    expect(screen.getByLabelText('Quantity of Oil filter used').disabled).toBe(
      true,
    );
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(postedBody(fn).consumable_quantities).toEqual([
      { item_id: 'item-oil', quantity: 4 },
    ]);
  });

  it('toasts consumable_warnings from the response without blocking completion', async () => {
    mockFetch([
      stowageItemsRoute([stockItem('item-zinc', 'Zincs', 2)]),
      {
        match: (m, u) =>
          m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: {
          id: 9,
          task_slug: 'engine-oil-change',
          consumable_warnings: [
            'stowage-mgmt item "Zincs" is split across locations',
          ],
        },
      },
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-zinc', item_name: 'Zincs', qty_per_service: 1 },
      ],
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${task} onClose=${onClose} />`);
    await waitFor(() =>
      expect(screen.getByLabelText('Zincs').checked).toBe(true),
    );
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(
      toasts.value.some(
        (t) => t.kind === 'error' && t.message.indexOf('Zincs') !== -1,
      ),
    ).toBe(true);
  });

  it('shows a location picker for a split linked item and blocks submit until fully allocated', async () => {
    mockFetch([
      {
        match: (m, u) =>
          m === 'GET' && u.indexOf('/signalk-stowage-mgmt/items') !== -1,
        body: [
          {
            id: 'item-zinc',
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
          },
        ],
      },
      {
        match: (m, u) =>
          m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change' },
      },
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-zinc', item_name: 'Zincs', qty_per_service: 3 },
      ],
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${task} onClose=${onClose} />`);

    await waitFor(() =>
      expect(screen.getByText(/Where did the 3 × Zincs/)).toBeTruthy(),
    );

    // submitting without picking a location shows a blocking error
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() =>
      expect(
        screen.getByText(/Pick a location for all of the Zincs/),
      ).toBeTruthy(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sends consumable_allocations once a split item is fully allocated', async () => {
    const fn = mockFetch([
      {
        match: (m, u) =>
          m === 'GET' && u.indexOf('/signalk-stowage-mgmt/items') !== -1,
        body: [
          {
            id: 'item-zinc',
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
          },
        ],
      },
      {
        match: (m, u) =>
          m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change' },
      },
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-zinc', item_name: 'Zincs', qty_per_service: 3 },
      ],
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${task} onClose=${onClose} />`);

    await waitFor(() =>
      expect(screen.getByLabelText('Location 1 for Zincs')).toBeTruthy(),
    );
    fireEvent.input(screen.getByLabelText('Location 1 for Zincs'), {
      target: { value: 'placement-1' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Location 2 for Zincs')).toBeTruthy(),
    );
    fireEvent.input(screen.getByLabelText('Location 2 for Zincs'), {
      target: { value: 'placement-2' },
    });
    await waitFor(() =>
      expect(screen.getByText('Fully allocated.')).toBeTruthy(),
    );

    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    const body = JSON.parse(call[1].body);
    expect(body.consumable_allocations).toEqual([
      {
        item_id: 'item-zinc',
        placements: [
          { placement_id: 'placement-1', quantity: 2 },
          { placement_id: 'placement-2', quantity: 1 },
        ],
      },
    ]);
  });

  it('does not show a location picker or send allocations for a non-split linked item', async () => {
    const fn = mockFetch([
      {
        match: (m, u) =>
          m === 'GET' && u.indexOf('/signalk-stowage-mgmt/items') !== -1,
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
      {
        match: (m, u) =>
          m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change' },
      },
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
      ],
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${task} onClose=${onClose} />`);
    await waitFor(() =>
      expect(screen.getByLabelText('Oil filter').disabled).toBe(false),
    );
    expect(screen.queryByText(/Where did the/)).toBeNull();

    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    expect(JSON.parse(call[1].body).consumable_allocations).toBeUndefined();
  });

  it('skips the allocation requirement when the stock checkbox is unchecked', async () => {
    const fn = mockFetch([
      {
        match: (m, u) =>
          m === 'GET' && u.indexOf('/signalk-stowage-mgmt/items') !== -1,
        body: [
          {
            id: 'item-zinc',
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
            ],
          },
        ],
      },
      {
        match: (m, u) =>
          m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change' },
      },
    ]);
    const task = makeTask({
      consumables: [
        { item_id: 'item-zinc', item_name: 'Zincs', qty_per_service: 1 },
      ],
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${task} onClose=${onClose} />`);
    await waitFor(() =>
      expect(screen.getByLabelText('Zincs').disabled).toBe(false),
    );
    fireEvent.click(screen.getByLabelText('Zincs'));
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    const body = JSON.parse(call[1].body);
    expect(body.consume_stock).toBe(false);
    expect(body.consumable_allocations).toBeUndefined();
  });
});
