import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
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

describe('TaskDetailPage — archive/unarchive', () => {
  async function renderLoggedIn(overrides) {
    const task = makeTask(overrides);
    const fn = mockFetch([
      {
        match: (m, u) => m === 'PUT' && u.indexOf('/api/tasks/') !== -1,
        body: Object.assign({}, task, { is_archived: !task.is_archived }),
      },
      ...detailRoutes(task),
    ]);
    authState.value = { checked: true, isLoggedIn: true, username: 'admin' };
    render(html`<${TaskDetailPage} slug=${task.slug} />`);
    await waitFor(() => expect(screen.getByText('Schedule')).toBeTruthy());
    return { task, fn };
  }

  it('offers Archive on a live task and PUTs is_archived: true', async () => {
    const { task, fn } = await renderLoggedIn({});
    expect(screen.queryByText('Unarchive')).toBeNull();
    const button = screen.getByText('Archive');
    expect(button.closest('button').className).toContain('btn-warning');

    fireEvent.click(button);
    await waitFor(() => {
      const put = fn.mock.calls.find((c) => c[1] && c[1].method === 'PUT');
      expect(put).toBeTruthy();
      expect(String(put[0])).toContain('/api/tasks/' + task.slug);
      expect(JSON.parse(put[1].body)).toEqual({ is_archived: true });
    });
  });

  it('offers Unarchive on an archived task and PUTs is_archived: false', async () => {
    const { fn } = await renderLoggedIn({
      is_archived: true,
      status: 'archived',
      status_rank: 4,
    });
    expect(screen.queryByText('Archive')).toBeNull();
    // the title badge reflects the archived status
    expect(document.querySelector('.page-title .badge.archived')).toBeTruthy();

    fireEvent.click(screen.getByText('Unarchive'));
    await waitFor(() => {
      const put = fn.mock.calls.find((c) => c[1] && c[1].method === 'PUT');
      expect(put).toBeTruthy();
      expect(JSON.parse(put[1].body)).toEqual({ is_archived: false });
    });
  });

  it('hides the button when logged out', async () => {
    await renderTask({});
    expect(screen.queryByText('Archive')).toBeNull();
  });
});

describe('TaskDetailPage — title bar and content cards', () => {
  it('labels the task with its tags in the title, not the description', async () => {
    await renderTask({ tags: ['Engines', 'Fluids'] });
    const tags = Array.from(document.querySelectorAll('.page-title .tag')).map(
      (el) => el.textContent,
    );
    expect(tags).toEqual(['Engines', 'Fluids']);
  });

  it('drops the content cards when there is no description, files, or parts', async () => {
    await renderTask({ description: null, consumables: [], files: [] });
    expect(screen.queryByText('Description')).toBeNull();
    expect(screen.queryByText('Files')).toBeNull();
    expect(screen.queryByText('Gallery')).toBeNull();
    expect(screen.queryByText('Consumables')).toBeNull();
  });

  it('gives parts a card of their own', async () => {
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
    expect(card('Consumables').textContent).toContain('Oil filter');
    expect(screen.queryByText('Description')).toBeNull();
    expect(screen.getByText('Oil filter')).toBeTruthy();
  });

  it('links each part at its stowage-mgmt detail page', async () => {
    await renderTask({
      description: null,
      consumables: [
        {
          item_id: 'oil filter/7',
          item_name: 'Oil filter',
          qty_per_service: 1,
        },
      ],
    });
    const link = screen.getByText('Oil filter');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(
      '/signalk-stowage-mgmt/?item=oil%20filter%2F7',
    );
  });

  it('shows "required / in stock" per part, colored by availability', async () => {
    const task = makeTask({
      description: null,
      consumables: [
        { item_id: 'item-filter', item_name: 'Oil filter', qty_per_service: 1 },
        { item_id: 'item-oil', item_name: 'Engine oil', qty_per_service: 4 },
        { item_id: 'item-belt', item_name: 'Drive belt', qty_per_service: 1 },
        { item_id: 'item-gone', item_name: 'Old gasket', qty_per_service: 1 },
      ],
    });
    mockFetch([
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
          {
            id: 'item-oil',
            name: 'Engine oil',
            actual_quantity: 2,
            target_quantity: 4,
            placements: [],
          },
          {
            id: 'item-belt',
            name: 'Drive belt',
            actual_quantity: 1,
            target_quantity: 2,
            placements: [],
          },
        ],
      },
      ...detailRoutes(task),
    ]);
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskDetailPage} slug=${task.slug} />`);
    await waitFor(() =>
      expect(screen.getByText('Oil filter').closest('tr').textContent).toMatch(
        /1 \/ 3/,
      ),
    );
    const rowOf = (name) => screen.getByText(name).closest('tr');
    expect(
      [...rowOf('Oil filter').closest('table').querySelectorAll('th')].map(
        (th) => th.textContent.trim(),
      ),
    ).toEqual(['Item', 'Quantity']);
    expect(
      rowOf('Oil filter').querySelector('.consumables-stock.ok'),
    ).toBeTruthy();
    expect(rowOf('Engine oil').textContent).toMatch(/4 \/ 2/);
    expect(
      rowOf('Engine oil').querySelector('.consumables-stock.short'),
    ).toBeTruthy();
    // Enough for this job, but below the restock target: orange.
    expect(rowOf('Drive belt').textContent).toMatch(/1 \/ 1/);
    expect(
      rowOf('Drive belt').querySelector('.consumables-stock.low'),
    ).toBeTruthy();
    // An item stowage-mgmt no longer knows: just the required qty, uncolored.
    expect(rowOf('Old gasket').textContent.replace(/\s+/g, '')).toBe(
      'Oldgasket1',
    );
    expect(rowOf('Old gasket').querySelector('.consumables-stock')).toBeNull();
  });

  it('puts the description, files and gallery each in a card of their own', async () => {
    await renderTask({
      description: 'Drain the sump.',
      files: [
        {
          id: 3,
          name: 'Yanmar manual.pdf',
          size: 2.5 * 1024 * 1024,
          mime: 'application/pdf',
          created_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 4,
          name: 'receipt.jpg',
          size: 800,
          mime: 'image/jpeg',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      'Description',
      'Schedule',
      'Runtime',
      'Files',
      'Gallery',
    ]);
    // Each heading heads its own card.
    expect(new Set(headings.map((h) => card(h))).size).toBe(headings.length);
    expect(card('Files').querySelector('.files-list')).toBeTruthy();
    expect(card('Gallery').querySelector('.files-gallery')).toBeTruthy();
    // images live in the gallery, not the list
    const rows = Array.from(document.querySelectorAll('.files-row')).map((li) =>
      li.textContent.trim(),
    );
    expect(rows).toEqual(['Yanmar manual.pdf2.5 MB']);
    const link = screen.getByText('Yanmar manual.pdf').closest('a');
    expect(link.getAttribute('href')).toBe(
      '/plugins/signalk-maintenance-tracker/api/tasks/engine-oil-change/files/3',
    );
    // Browsers show PDFs themselves: open in a tab rather than download.
    expect(link.getAttribute('download')).toBeNull();
    expect(link.getAttribute('target')).toBe('_blank');

    // Images are thumbnails that open in a tab.
    const thumbs = Array.from(document.querySelectorAll('.files-thumb'));
    expect(thumbs[0].getAttribute('target')).toBe('_blank');
    expect(thumbs[0].getAttribute('rel')).toBe('noopener');
    expect(thumbs[0].getAttribute('download')).toBeNull();
    expect(thumbs.map((a) => a.getAttribute('href'))).toEqual([
      '/plugins/signalk-maintenance-tracker/api/tasks/engine-oil-change/files/4',
    ]);
    expect(thumbs[0].querySelector('img').getAttribute('src')).toBe(
      '/plugins/signalk-maintenance-tracker/api/tasks/engine-oil-change/files/4',
    );
    expect(thumbs[0].querySelector('img').getAttribute('alt')).toBe(
      'receipt.jpg',
    );
  });

  it('widens the gallery over the free columns left in its row', async () => {
    const image = (id) => ({
      id,
      name: 'photo' + id + '.jpg',
      size: 800,
      mime: 'image/jpeg',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    // Schedule + Runtime fill two of the three columns: one left over, so
    // five photos still get just one column.
    await renderTask({ files: [1, 2, 3, 4, 5].map(image) });
    expect(card('Gallery').style.getPropertyValue('--gallery-columns')).toBe(
      '1',
    );
  });

  it('starts a fresh row with as many columns as the photos need', async () => {
    const image = (id) => ({
      id,
      name: 'photo' + id + '.jpg',
      size: 800,
      mime: 'image/jpeg',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    // Description + Schedule + Runtime fill the first row; three photos want
    // two columns of the next.
    await renderTask({
      description: 'Drain the sump.',
      files: [1, 2, 3].map(image),
    });
    expect(card('Gallery').style.getPropertyValue('--gallery-columns')).toBe(
      '2',
    );
  });

  it('shows only the gallery when every attachment is an image', async () => {
    await renderTask({
      description: null,
      files: [
        {
          id: 4,
          name: 'receipt.jpg',
          size: 800,
          mime: 'image/jpeg',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(card('Gallery')).toBeTruthy();
    expect(screen.queryByText('Files')).toBeNull();
    expect(document.querySelector('.files-list')).toBeNull();
    expect(document.querySelectorAll('.files-thumb')).toHaveLength(1);
  });

  it('downloads what the browser cannot show, with no gallery without images', async () => {
    await renderTask({
      files: [
        {
          id: 3,
          name: 'diagram.svg',
          size: 10,
          mime: 'image/svg+xml',
          created_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 5,
          name: 'spec.docx',
          size: 10,
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(document.querySelector('.files-gallery')).toBeNull();
    for (const name of ['diagram.svg', 'spec.docx']) {
      const a = screen.getByText(name).closest('a');
      expect(a.getAttribute('download')).toBe(name);
      expect(a.getAttribute('target')).toBeNull();
    }
  });

  it('shows the Files card without a description', async () => {
    await renderTask({
      description: null,
      files: [
        {
          id: 3,
          name: 'notes.txt',
          size: 10,
          mime: 'text/plain',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(card('Files')).toBeTruthy();
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('shows the description card for a description alone', async () => {
    await renderTask({ description: 'Drain the sump.', consumables: [] });
    expect(screen.getByText('Drain the sump.')).toBeTruthy();
  });
});

describe('TaskDetailPage — log details', () => {
  const logs = [
    {
      id: 21,
      task_id: 1,
      title: null,
      maintenance_date: '2026-03-04T00:00:00.000Z',
      runtime_hours: 1300,
      notes: null,
      logged_by: 'zach',
      created_at: '2026-03-04T00:00:00.000Z',
      files: [
        {
          id: 5,
          name: 'after.jpg',
          size: 900,
          mime: 'image/jpeg',
          created_at: '2026-03-04T00:00:00.000Z',
        },
      ],
    },
    {
      id: 22,
      task_id: 1,
      title: null,
      maintenance_date: '2025-03-04T00:00:00.000Z',
      runtime_hours: 1100,
      notes: null,
      logged_by: 'zach',
      created_at: '2025-03-04T00:00:00.000Z',
      files: [],
    },
  ];

  it('keeps the log to date, runtime and user, with a magnifying glass on every entry', async () => {
    const task = makeTask();
    mockFetch(detailRoutes(task, logs));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskDetailPage} slug=${task.slug} />`);
    await waitFor(() =>
      expect(screen.getAllByLabelText('View log entry details')).toHaveLength(
        2,
      ),
    );
    expect(screen.queryByLabelText('View attachments')).toBeNull();
    // the user column drops out on phones
    const byCells = screen.getAllByText('zach').map((el) => el.closest('td'));
    expect(byCells).toHaveLength(2);
    expect(byCells[0].className).toContain('hide-sm');
    // nothing inline in the log table
    expect(document.querySelectorAll('.files-thumb')).toHaveLength(0);
  });

  it('opens the entry in a details modal', async () => {
    const task = makeTask();
    mockFetch(detailRoutes(task, logs));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskDetailPage} slug=${task.slug} />`);
    await waitFor(() =>
      expect(screen.getAllByLabelText('View log entry details')).toHaveLength(
        2,
      ),
    );
    fireEvent.click(screen.getAllByLabelText('View log entry details')[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe(
      'Log entry — Engine oil change, 2026-03-04',
    );
    expect(dialog.querySelector('.stat-table').textContent).toContain('zach');
    const headings = Array.from(dialog.querySelectorAll('h3')).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(['Images']);
    expect(dialog.querySelector('.files-thumb').getAttribute('href')).toBe(
      '/plugins/signalk-maintenance-tracker/api/logs/21/files/5',
    );
  });

  it('orders the magnifying glass before edit and delete when logged in', async () => {
    const task = makeTask();
    mockFetch(detailRoutes(task, logs));
    authState.value = { checked: true, isLoggedIn: true, username: 'admin' };
    render(html`<${TaskDetailPage} slug=${task.slug} />`);
    await waitFor(() =>
      expect(screen.getAllByLabelText('View log entry details')).toHaveLength(
        2,
      ),
    );
    const cell = screen
      .getAllByLabelText('View log entry details')[0]
      .closest('td');
    const labels = Array.from(cell.querySelectorAll('button')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels).toEqual([
      'View log entry details',
      'Edit log entry',
      'Delete log entry',
    ]);
  });
});
