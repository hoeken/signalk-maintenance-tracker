import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { PlacementAllocator } from '../../public/app/components/PlacementAllocator.js';

/** @type {import('../../public/app/api/stowage.js').StowagePlacement[]} */
const TWO_LOCATIONS = [
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
    quantity: 5,
  },
];

describe('PlacementAllocator (docs/inventory-interaction.md)', () => {
  it('shows a single location field to start, with a remaining-quantity hint', () => {
    const onChange = vi.fn();
    render(
      html`<${PlacementAllocator}
        itemName="Zincs"
        required=${3}
        placements=${TWO_LOCATIONS}
        onChange=${onChange}
      />`,
    );
    expect(screen.getAllByLabelText(/Location \d for Zincs/).length).toBe(1);
    expect(screen.getByText('3 still needs a location.')).toBeTruthy();
  });

  it('fully covers the requirement from one location when it has enough', async () => {
    const onChange = vi.fn();
    render(
      html`<${PlacementAllocator}
        itemName="Zincs"
        required=${3}
        placements=${TWO_LOCATIONS}
        onChange=${onChange}
      />`,
    );
    fireEvent.input(screen.getByLabelText('Location 1 for Zincs'), {
      target: { value: 'placement-2' }, // has 5, need 3
    });
    await waitFor(() =>
      expect(screen.getByText('Fully allocated.')).toBeTruthy(),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      [{ placement_id: 'placement-2', quantity: 3 }],
      true,
    );
    // no second row needed
    expect(screen.getAllByLabelText(/Location \d for Zincs/).length).toBe(1);
  });

  it('auto-adds a second location field when the first does not fully cover it', async () => {
    const onChange = vi.fn();
    render(
      html`<${PlacementAllocator}
        itemName="Zincs"
        required=${3}
        placements=${TWO_LOCATIONS}
        onChange=${onChange}
      />`,
    );
    fireEvent.input(screen.getByLabelText('Location 1 for Zincs'), {
      target: { value: 'placement-1' }, // only has 2, need 3
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Location 2 for Zincs')).toBeTruthy(),
    );
    expect(screen.getByText('1 still needs a location.')).toBeTruthy();

    fireEvent.input(screen.getByLabelText('Location 2 for Zincs'), {
      target: { value: 'placement-2' },
    });
    await waitFor(() =>
      expect(screen.getByText('Fully allocated.')).toBeTruthy(),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      [
        { placement_id: 'placement-1', quantity: 2 },
        { placement_id: 'placement-2', quantity: 1 },
      ],
      true,
    );
  });

  it('excludes an already-picked location from later rows', async () => {
    render(
      html`<${PlacementAllocator}
        itemName="Zincs"
        required=${3}
        placements=${TWO_LOCATIONS}
        onChange=${() => {}}
      />`,
    );
    fireEvent.input(screen.getByLabelText('Location 1 for Zincs'), {
      target: { value: 'placement-1' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Location 2 for Zincs')).toBeTruthy(),
    );
    const secondSelect = /** @type {HTMLSelectElement} */ (
      screen.getByLabelText('Location 2 for Zincs')
    );
    const optionValues = Array.from(secondSelect.options).map((o) => o.value);
    expect(optionValues).not.toContain('placement-1');
    expect(optionValues).toContain('placement-2');
  });

  it('reports incomplete and shows an exhausted message when total stock is insufficient', async () => {
    const onChange = vi.fn();
    render(
      html`<${PlacementAllocator}
        itemName="Zincs"
        required=${99}
        placements=${TWO_LOCATIONS}
        onChange=${onChange}
      />`,
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
      expect(
        screen.getByText(
          'Not enough stock across known locations to cover this amount.',
        ),
      ).toBeTruthy(),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      [
        { placement_id: 'placement-1', quantity: 2 },
        { placement_id: 'placement-2', quantity: 5 },
      ],
      false,
    );
  });

  it('removing a row recomputes the remaining amount', async () => {
    const onChange = vi.fn();
    render(
      html`<${PlacementAllocator}
        itemName="Zincs"
        required=${3}
        placements=${TWO_LOCATIONS}
        onChange=${onChange}
      />`,
    );
    fireEvent.input(screen.getByLabelText('Location 1 for Zincs'), {
      target: { value: 'placement-1' }, // only 2, leaves 1 remaining
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
    fireEvent.click(screen.getByLabelText('Remove location 2'));
    await waitFor(() =>
      expect(screen.getByText('1 still needs a location.')).toBeTruthy(),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      [{ placement_id: 'placement-1', quantity: 2 }],
      false,
    );
  });
});
