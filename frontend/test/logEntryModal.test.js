import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { LogEntryModal } from '../../public/app/components/LogEntryModal.js';
import { toasts } from '../../public/app/lib/toasts.js';
import { mockFetch, makeTask } from './helpers.js';

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

  it('does not show the stock checkbox for a task with no linked consumables', () => {
    mockFetch([]);
    render(html`<${LogEntryModal} task=${makeTask()} onClose=${() => {}} />`);
    expect(screen.queryByText(/Update signalk-stowage-mgmt stock/)).toBeNull();
  });

  it('shows the stock checkbox (checked by default) for a task with linked consumables, and sends consume_stock', async () => {
    const fn = mockFetch([
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
    const checkbox = /** @type {HTMLInputElement} */ (
      screen.getByLabelText(/Update signalk-stowage-mgmt stock/)
    );
    expect(checkbox.checked).toBe(true);
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    expect(JSON.parse(call[1].body).consume_stock).toBe(true);
  });

  it('unchecking the box sends consume_stock: false', async () => {
    const fn = mockFetch([
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
    fireEvent.click(screen.getByLabelText(/Update signalk-stowage-mgmt stock/));
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    expect(JSON.parse(call[1].body).consume_stock).toBe(false);
  });

  it('toasts consumable_warnings from the response without blocking completion', async () => {
    mockFetch([
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
          m === 'GET' && u.indexOf('/signalk-stowage-mgmt/api/items') !== -1,
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
          m === 'GET' && u.indexOf('/signalk-stowage-mgmt/api/items') !== -1,
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
      expect(
        screen.getByLabelText(/Update signalk-stowage-mgmt stock/),
      ).toBeTruthy(),
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
          m === 'GET' && u.indexOf('/signalk-stowage-mgmt/api/items') !== -1,
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
    fireEvent.click(screen.getByLabelText(/Update signalk-stowage-mgmt stock/));
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    const body = JSON.parse(call[1].body);
    expect(body.consume_stock).toBe(false);
    expect(body.consumable_allocations).toBeUndefined();
  });
});
