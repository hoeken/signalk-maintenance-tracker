import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { formatCost, formatWorkHours } from '../../public/app/lib/format.js';
import { aggregateOf, parseAmount } from '../../public/app/lib/stats.js';
import { TaskDetailPage } from '../../public/app/pages/TaskDetailPage.js';
import { TaskListPage } from '../../public/app/pages/TaskListPage.js';
import { MasterLogPage } from '../../public/app/pages/MasterLogPage.js';
import { StatsPage } from '../../public/app/pages/StatsPage.js';
import { LogEntryModal } from '../../public/app/components/LogEntryModal.js';
import { LogDetailsModal } from '../../public/app/components/LogDetailsModal.js';
import { authState } from '../../public/app/auth/auth.js';
import { route, parseHash } from '../../public/app/lib/router.js';
import { mockFetch, makeTask } from './helpers.js';

/** Hours/cost aggregate in the API's shape. */
function agg(total, count) {
  return { total, count, average: count ? total / count : null };
}
const NONE = { hours: agg(0, 0), cost: agg(0, 0) };

function makeLog(overrides) {
  return Object.assign(
    {
      id: 1,
      task_id: 1,
      title: null,
      maintenance_date: '2026-03-01T00:00:00.000Z',
      runtime_hours: null,
      notes: null,
      logged_by: null,
      actual_hours: null,
      actual_cost: null,
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: null,
      task_slug: 'engine-oil-change',
      task_name: 'Engine oil change',
      files: [],
    },
    overrides || {},
  );
}

/** Label → value pairs of the totals bar under a list. */
function totals() {
  return Array.from(document.querySelectorAll('.totals-item')).map((el) => [
    el.querySelector('.muted').textContent,
    el.querySelector('strong').textContent,
  ]);
}

/** The value cell of the `label` row in the card headed `title`. */
function statValue(title, label) {
  const heading = screen
    .getAllByRole('heading', { level: 3 })
    .find((h) => h.textContent === title);
  if (!heading) return undefined;
  const row = Array.from(
    heading.closest('.card').querySelectorAll('.stat-table tr'),
  ).find((tr) => tr.querySelector('th').textContent === label);
  return row ? row.querySelector('td').textContent : null;
}

describe('hours/cost helpers', () => {
  it('formats decimal hours and $ costs', () => {
    expect(formatWorkHours(0.25)).toBe('0.25 h');
    expect(formatWorkHours(1.5)).toBe('1.5 h');
    expect(formatWorkHours(null)).toBe('—');
    expect(formatCost(12.5)).toBe('$12.50');
    expect(formatCost(null)).toBe('—');
  });

  it('aggregates only recorded values', () => {
    expect(aggregateOf([1, null, 2, undefined])).toEqual({
      total: 3,
      count: 2,
      average: 1.5,
    });
    expect(aggregateOf([null])).toEqual({ total: 0, count: 0, average: null });
  });

  it('parses optional amount inputs', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(' 0.25 ')).toBe(0.25);
    expect(parseAmount('-1')).toBeUndefined();
    expect(parseAmount('abc')).toBeUndefined();
  });
});

describe('task detail — Time and Costs cards', () => {
  async function renderDetail(task, logs) {
    mockFetch([
      {
        match: (m, u) => m === 'GET' && u.indexOf('/logs') !== -1,
        body: { data: logs },
      },
      {
        match: (m, u) => m === 'GET' && u.indexOf('/api/tasks/') !== -1,
        body: task,
      },
    ]);
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskDetailPage} slug=${task.slug} />`);
    await waitFor(() => expect(screen.getByText('Schedule')).toBeTruthy());
  }

  it('shows estimate, total and average from the log entries', async () => {
    await renderDetail(makeTask({ estimated_hours: 1, estimated_cost: 40 }), [
      makeLog({ id: 1, actual_hours: 1.5, actual_cost: 50 }),
      makeLog({ id: 2, actual_hours: 0.5 }),
    ]);
    await waitFor(() => expect(statValue('Time', 'Total')).toBe('2 h'));
    expect(statValue('Time', 'Estimated')).toBe('1 h');
    expect(statValue('Time', 'Average')).toBe('1 h (2 entries)');
    expect(statValue('Costs', 'Estimated')).toBe('$40.00');
    expect(statValue('Costs', 'Total')).toBe('$50.00');
    expect(statValue('Costs', 'Average')).toBe('$50.00 (1 entry)');
  });

  it('leaves out a card with no data, and rows with nothing to show', async () => {
    await renderDetail(makeTask({ estimated_hours: 0.25 }), []);
    expect(statValue('Time', 'Estimated')).toBe('0.25 h');
    expect(statValue('Time', 'Total')).toBeNull();
    expect(statValue('Costs', 'Estimated')).toBeUndefined();
  });
});

describe('log entries — actual hours and cost', () => {
  it('defaults to the task estimates on mark complete and posts them', async () => {
    const fn = mockFetch([
      {
        match: (m) => m === 'POST',
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change' },
      },
    ]);
    render(
      html`<${LogEntryModal}
        task=${makeTask({ estimated_hours: 0.5, estimated_cost: 20 })}
        onClose=${() => {}}
      />`,
    );
    expect(screen.getByLabelText('Actual time (hours)').value).toBe('0.5');
    expect(screen.getByLabelText('Actual cost ($)').value).toBe('20');
    fireEvent.input(screen.getByLabelText('Actual cost ($)'), {
      target: { value: '22.75' },
    });
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(fn).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    const body = JSON.parse(call[1].body);
    expect(body.actual_hours).toBe(0.5);
    expect(body.actual_cost).toBe(22.75);
  });

  it('rejects a negative amount', async () => {
    const fn = mockFetch([]);
    render(html`<${LogEntryModal} task=${makeTask()} onClose=${() => {}} />`);
    expect(screen.getByLabelText('Actual time (hours)').value).toBe('');
    fireEvent.input(screen.getByLabelText('Actual time (hours)'), {
      target: { value: '-1' },
    });
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Actual time must be 0 or a positive number of hours.',
        ),
      ).toBeTruthy(),
    );
    expect(fn.mock.calls.some((c) => c[1] && c[1].method === 'POST')).toBe(
      false,
    );
  });

  it('shows recorded figures in the details modal, and only those', () => {
    render(
      html`<${LogDetailsModal}
        entry=${makeLog({ actual_hours: 0.25 })}
        onClose=${() => {}}
      />`,
    );
    const labels = Array.from(document.querySelectorAll('.stat-table th')).map(
      (th) => th.textContent,
    );
    expect(labels).toContain('Time');
    expect(labels).not.toContain('Cost');
    expect(screen.getByText('0.25 h')).toBeTruthy();
  });
});

describe('list totals', () => {
  it('shows estimated and actual totals under the task list', async () => {
    route.value = parseHash('#/');
    mockFetch([
      {
        match: (m, u) => m === 'GET' && u.indexOf('/api/tasks?') !== -1,
        body: {
          data: [makeTask()],
          total: 1,
          page: 1,
          pageSize: 20,
          stats: {
            estimated: { hours: agg(3.5, 2), cost: agg(0, 0) },
            actual: { hours: agg(0, 0), cost: agg(85, 2) },
          },
        },
      },
      {
        match: (m, u) => m === 'GET' && u.indexOf('/api/tags') !== -1,
        body: { data: [] },
      },
    ]);
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskListPage} />`);
    await waitFor(() => expect(totals().length).toBeGreaterThan(0));
    expect(totals()).toEqual([
      ['Estimated time', '3.5 h'],
      ['Actual cost', '$85.00'],
    ]);
    expect(screen.getByRole('heading', { name: 'Statistics' })).toBeTruthy();
    expect(
      screen.getByText(
        /^Across all 1 task matching .* not just the ones shown/,
      ),
    ).toBeTruthy();
  });

  it('shows total and average under the master log', async () => {
    route.value = parseHash('#/log');
    mockFetch([
      {
        match: (m, u) => m === 'GET' && u.indexOf('/api/logs') !== -1,
        body: {
          data: [makeLog()],
          total: 1,
          page: 1,
          pageSize: 25,
          stats: { hours: agg(3, 2), cost: agg(0, 0) },
        },
      },
    ]);
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(totals().length).toBeGreaterThan(0));
    expect(totals()).toEqual([
      ['Total time', '3 h'],
      ['Average time', '1.5 h'],
    ]);
    expect(screen.getByRole('heading', { name: 'Statistics' })).toBeTruthy();
    expect(screen.getByText(/^Across all 1 log entry matching/)).toBeTruthy();
  });

  it('renders nothing when no hours or costs are recorded', async () => {
    route.value = parseHash('#/log');
    mockFetch([
      {
        match: (m, u) => m === 'GET' && u.indexOf('/api/logs') !== -1,
        body: {
          data: [makeLog()],
          total: 1,
          page: 1,
          pageSize: 25,
          stats: NONE,
        },
      },
    ]);
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${MasterLogPage} />`);
    await waitFor(() =>
      expect(screen.getByText('Engine oil change')).toBeTruthy(),
    );
    expect(document.querySelector('.totals')).toBeNull();
  });
});

describe('StatsPage', () => {
  function statsRoute(body) {
    return {
      match: (m, u) => m === 'GET' && u.indexOf('/api/stats') !== -1,
      body,
    };
  }

  it('shows overall figures and a per-task breakdown', async () => {
    mockFetch([
      statsRoute({
        estimated: { hours: agg(1, 1), cost: agg(0, 0) },
        actual: { hours: agg(7.5, 2), cost: agg(0, 0) },
        tasks: [
          {
            slug: 'engine-oil-change',
            name: 'Engine oil change',
            is_archived: false,
            is_recurring: true,
            estimated_hours: 1,
            estimated_cost: null,
            log_count: 3,
            actual: { hours: agg(1.5, 1), cost: agg(0, 0) },
          },
        ],
        standalone: {
          log_count: 1,
          actual: { hours: agg(6, 1), cost: agg(0, 0) },
        },
      }),
    ]);
    render(html`<${StatsPage} />`);
    await waitFor(() => expect(screen.getByText('By task')).toBeTruthy());
    expect(statValue('Time', 'Estimated total')).toBe('1 h (1 task)');
    expect(statValue('Time', 'Actual total')).toBe('7.5 h (2 entries)');
    expect(statValue('Time', 'Average actual')).toBe('3.75 h');
    // no cost recorded anywhere: no Costs card
    expect(statValue('Costs', 'Actual total')).toBeUndefined();
    expect(screen.getByText('Engine oil change')).toBeTruthy();
    expect(screen.getByText('Standalone entries')).toBeTruthy();
  });

  it('explains how to get figures when there are none', async () => {
    mockFetch([
      statsRoute({
        estimated: NONE,
        actual: NONE,
        tasks: [],
        standalone: { log_count: 0, actual: NONE },
      }),
    ]);
    render(html`<${StatsPage} />`);
    await waitFor(() =>
      expect(screen.getByText(/No hours or costs recorded yet/)).toBeTruthy(),
    );
  });
});
