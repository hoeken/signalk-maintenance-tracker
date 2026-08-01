import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { TaskDetailPage } from '../../public/app/pages/TaskDetailPage.js';
import { authState } from '../../public/app/auth/auth.js';
import { mockFetch, makeTask } from './helpers.js';

/** Routes for the detail page: the task itself plus its log. */
function detailRoutes(task, logs) {
  return [
    {
      match: (m, u) => m === 'GET' && u.indexOf('/logs') !== -1,
      body: { data: logs || [] },
    },
    {
      match: (m, u) => m === 'GET' && u.indexOf('/api/tasks/') !== -1,
      body: task,
    },
  ];
}

async function renderTask(overrides) {
  const task = makeTask(overrides);
  mockFetch(detailRoutes(task));
  authState.value = { checked: true, isLoggedIn: false, username: null };
  render(html`<${TaskDetailPage} slug=${task.slug} />`);
  await waitFor(() => expect(screen.getByText('Schedule')).toBeTruthy());
  return task;
}

/** The card element headed by `title`. */
function card(title) {
  const heading = screen
    .getAllByRole('heading', { level: 3 })
    .find((h) => h.textContent === title);
  expect(heading).toBeTruthy();
  return heading.closest('.card');
}

/** The value cell of the `label` row in the card headed `title`. */
function statValue(title, label) {
  const row = Array.from(card(title).querySelectorAll('.stat-table tr')).find(
    (tr) => tr.querySelector('th').textContent === label,
  );
  return row ? row.querySelector('td').textContent : null;
}

/** Row labels present in the card headed `title`, in order. */
function statLabels(title) {
  return Array.from(card(title).querySelectorAll('.stat-table th')).map(
    (th) => th.textContent,
  );
}

describe('TaskDetailPage — schedule and runtime cards', () => {
  it('splits the schedule and runtime dimensions into their own cards', async () => {
    await renderTask({});
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(['Schedule', 'Runtime']);
  });

  it('tabulates the runtime dimension', async () => {
    await renderTask({});
    expect(statLabels('Runtime')).toEqual([
      'Interval',
      'Current',
      'Last',
      'Elapsed',
      'Next',
      'Remaining',
    ]);
    expect(statValue('Runtime', 'Interval')).toBe('every 200 h');
    expect(statValue('Runtime', 'Last')).toBe('1240.5 h');
    expect(statValue('Runtime', 'Current')).toBe('1360 h');
    expect(statValue('Runtime', 'Elapsed')).toBe('119.5 h');
    expect(statValue('Runtime', 'Next')).toBe('1440.5 h');
    expect(statValue('Runtime', 'Remaining')).toBe('80.5 h');
  });

  it('tabulates the schedule dimension', async () => {
    await renderTask({ elapsed_time_ms: 30 * 86400000 });
    expect(statLabels('Schedule')).toEqual([
      'Interval',
      'Today',
      'Last',
      'Elapsed',
      'Next',
      'Remaining',
    ]);
    expect(statValue('Schedule', 'Interval')).toBe('every 12 months');
    expect(statValue('Schedule', 'Last')).toBe('2026-01-15');
    expect(statValue('Schedule', 'Elapsed')).toBe('30 days');
    expect(statValue('Schedule', 'Next')).toBe('2027-01-15');
    expect(statValue('Schedule', 'Remaining')).toBe('193 days');
  });

  it('marks an overdue remaining figure with its status class', async () => {
    await renderTask({ remaining_runtime: -20, runtime_status: 'overdue' });
    expect(statValue('Runtime', 'Remaining')).toBe('20 h overdue');
    expect(document.querySelector('.remaining.overdue')).toBeTruthy();
  });

  it('shows last/elapsed runtime with no runtime interval configured', async () => {
    await renderTask({
      runtime_interval: null,
      remaining_runtime: null,
      due_runtime_at: null,
      runtime_fraction: null,
      runtime_status: null,
    });
    // no interval → nothing is due, but the readings still stand on their own
    expect(statLabels('Runtime')).toEqual(['Current', 'Last', 'Elapsed']);
    expect(statValue('Runtime', 'Elapsed')).toBe('119.5 h');
  });

  it('shows last/elapsed time with no interval or due date configured', async () => {
    await renderTask({
      time_interval: null,
      time_interval_unit: null,
      due_date: null,
      scheduled_due_date: null,
      scheduled_remaining_ms: null,
      scheduled_fraction: null,
      scheduled_status: null,
      remaining_time_ms: null,
      time_fraction: null,
      time_status: null,
      last_maintenance: '2026-06-09T12:00:00.000Z',
      elapsed_time_ms: 30 * 86400000,
    });
    expect(statLabels('Schedule')).toEqual(['Today', 'Last', 'Elapsed']);
    expect(statValue('Schedule', 'Last')).toBe('2026-06-09');
    expect(statValue('Schedule', 'Elapsed')).toBe('30 days');
  });

  // deadline is sooner than the fixture's 2027-01-15 recurring due date
  const deadline = {
    due_date: '2026-09-30T00:00:00.000Z',
    due_date_remaining_ms: 5184000000,
    due_date_fraction: 0.5,
    due_date_status: 'ok',
    remaining_time_ms: 5184000000,
  };

  it('gives a one-time deadline its own row alongside an interval', async () => {
    await renderTask(deadline);
    expect(statValue('Schedule', 'Deadline')).toBe('2026-09-30');
    // "Next" follows the sooner of the two, matching remaining_time_ms
    expect(statValue('Schedule', 'Next')).toBe('2026-09-30');
  });

  it('drops the deadline row when the deadline is the only dimension', async () => {
    await renderTask({
      ...deadline,
      time_interval: null,
      time_interval_unit: null,
      scheduled_due_date: null,
      scheduled_remaining_ms: null,
      scheduled_fraction: null,
      scheduled_status: null,
    });
    // it *is* the next thing due, so a separate row would just repeat it
    expect(statLabels('Schedule')).not.toContain('Deadline');
    expect(statValue('Schedule', 'Next')).toBe('2026-09-30');
  });

  it('hides the runtime card entirely when nothing tracks runtime', async () => {
    await renderTask({
      runtime_interval: null,
      runtime_path: null,
      time_interval: null,
      time_interval_unit: null,
      due_date: null,
      last_maintenance: null,
      last_runtime: null,
      current_runtime: null,
      elapsed_runtime: null,
      elapsed_time_ms: null,
      remaining_runtime: null,
      due_runtime_at: null,
      runtime_fraction: null,
      runtime_status: null,
      scheduled_due_date: null,
      scheduled_remaining_ms: null,
      scheduled_fraction: null,
      scheduled_status: null,
      remaining_time_ms: null,
      time_fraction: null,
      time_status: null,
    });
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(['Schedule']);
    expect(
      screen.getByText('No interval or due date configured.'),
    ).toBeTruthy();
    expect(document.querySelector('.stat-table')).toBeNull();
  });

  it('draws each progress bar below its table', async () => {
    await renderTask({});
    const bars = document.querySelectorAll('.progress');
    expect(bars.length).toBe(2);
    expect(bars[0].getAttribute('aria-valuenow')).toBe('48'); // time_fraction
    expect(bars[1].getAttribute('aria-valuenow')).toBe('60'); // runtime_fraction
    // Last in the card, so the tables start at the same line whether or not a
    // card has a bar to draw.
    for (const bar of bars) {
      expect(bar.previousElementSibling.className).toContain('stat-table');
      expect(bar.parentElement.lastElementChild).toBe(bar);
    }
  });
});

describe('TaskDetailPage — title bar and description card', () => {
  it('labels the task with its tags in the title, not the description', async () => {
    await renderTask({ tags: ['Engines', 'Fluids'] });
    const tags = Array.from(document.querySelectorAll('.page-title .tag')).map(
      (el) => el.textContent,
    );
    expect(tags).toEqual(['Engines', 'Fluids']);
  });

  it('drops the description card when there is no description and no parts', async () => {
    await renderTask({ description: null, consumables: [] });
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('keeps the description card for parts alone', async () => {
    await renderTask({
      description: null,
      consumables: [
        {
          item_id: 7,
          item_name: 'Oil filter',
          qty_per_service: 1,
          qty_on_hand: 3,
        },
      ],
    });
    expect(card('Description')).toBeTruthy();
    expect(screen.getByText('Oil filter')).toBeTruthy();
  });

  it('keeps the description card for a description alone', async () => {
    await renderTask({ description: 'Drain the sump.', consumables: [] });
    expect(screen.getByText('Drain the sump.')).toBeTruthy();
  });
});
