import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import dayjs from '../../public/vendor/dayjs/index.js';
import { MasterLogPage } from '../../public/app/pages/MasterLogPage.js';
import { authState } from '../../public/app/auth/auth.js';
import { mockFetch, apiRoutes } from './helpers.js';

/** @type {import('../../public/app/types.js').LogDTO[]} */
const logs = [
  {
    id: 1,
    task_id: 1,
    title: null,
    maintenance_date: '2026-01-02T00:00:00.000Z',
    runtime_hours: 12.5,
    notes: null,
    logged_by: 'zach',
    created_at: '2026-01-02T00:00:00.000Z',
    task_slug: 'engine-oil',
    task_name: 'Engine oil',
  },
  {
    id: 2,
    task_id: null,
    title: 'Haul out',
    maintenance_date: '2026-03-04T00:00:00.000Z',
    runtime_hours: null,
    notes: null,
    logged_by: 'zach',
    created_at: '2026-03-04T00:00:00.000Z',
    task_slug: null,
    task_name: null,
  },
];

describe('master log page (§7.4)', () => {
  it('links task entries to their task and shows standalone titles as plain text', async () => {
    mockFetch(apiRoutes({ logs }));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Engine oil' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Haul out' })).toBeNull();
  });

  it('logged out: no New Entry button or per-entry edit/delete', async () => {
    mockFetch(apiRoutes({ logs }));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
    expect(screen.queryByText('New Entry')).toBeNull();
    expect(screen.queryByLabelText('Edit log entry')).toBeNull();
    expect(screen.queryByLabelText('Delete log entry')).toBeNull();
  });

  it('logged in: New Entry (btn-success) and per-entry edit/delete render', async () => {
    mockFetch(apiRoutes({ logs }));
    authState.value = { checked: true, isLoggedIn: true, username: 'admin' };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
    const newButton = screen.getByText('New Entry').closest('button');
    expect(newButton.className).toContain('btn-success');
    expect(screen.getAllByLabelText('Edit log entry')).toHaveLength(2);
    expect(screen.getAllByLabelText('Delete log entry')).toHaveLength(2);
  });
});

describe('master log page — details modal', () => {
  const pdf = {
    id: 3,
    name: 'yard-bill.pdf',
    size: 2048,
    mime: 'application/pdf',
    created_at: '2026-01-02T00:00:00.000Z',
  };
  const jpg = {
    id: 4,
    name: 'impeller.jpg',
    size: 800,
    mime: 'image/jpeg',
    created_at: '2026-01-02T00:00:00.000Z',
  };
  const detailed = [
    { ...logs[0], notes: 'Swapped the **filter** too.', files: [pdf, jpg] },
    { ...logs[1], files: [] },
  ];

  it('keeps rows to task, date and runtime — no By column, notes or files', async () => {
    mockFetch(apiRoutes({ logs: detailed }));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
    const headers = Array.from(document.querySelectorAll('thead th')).map(
      (th) => th.textContent.trim(),
    );
    expect(headers).toEqual(['Task', 'Date', 'Runtime', '']);
    // date and runtime drop out on phones so each entry stays on one line
    const hidden = Array.from(document.querySelectorAll('th.hide-sm')).map(
      (th) => th.textContent.trim(),
    );
    expect(hidden).toEqual(['Date', 'Runtime']);
    expect(document.querySelectorAll('td.hide-sm')).toHaveLength(4);
    // long task names are cut off with an ellipsis, the full name on hover
    const taskCell = screen.getByText('Engine oil').closest('td');
    expect(taskCell.className).toContain('col-truncate');
    expect(screen.getByText('Engine oil').getAttribute('title')).toBe(
      'Engine oil',
    );
    expect(screen.queryByText('zach')).toBeNull();
    expect(screen.queryByText('filter')).toBeNull();
    expect(screen.queryByLabelText('View attachments')).toBeNull();
    expect(document.querySelectorAll('.files-thumb')).toHaveLength(0);
  });

  it('gives every entry a magnifying glass, visible logged out', async () => {
    mockFetch(apiRoutes({ logs: detailed }));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
    const buttons = screen.getAllByLabelText('View log entry details');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].querySelector('.bi-search')).toBeTruthy();
    expect(buttons[0].className).toContain('success');
    expect(screen.queryByLabelText('Edit log entry')).toBeNull();
  });

  it('puts the magnifying glass before the edit icon when logged in', async () => {
    mockFetch(apiRoutes({ logs: detailed }));
    authState.value = { checked: true, isLoggedIn: true, username: 'admin' };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
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

  it('opens a modal with the figures, notes, Files and Images', async () => {
    mockFetch(apiRoutes({ logs: detailed }));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
    fireEvent.click(screen.getAllByLabelText('View log entry details')[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe(
      'Log entry — Engine oil, 2026-01-02',
    );
    const stats = Array.from(dialog.querySelectorAll('.stat-table tr')).map(
      (tr) => [
        tr.querySelector('th').textContent,
        tr.querySelector('td').textContent.trim(),
      ],
    );
    expect(stats).toEqual([
      ['Task', 'Engine oil'],
      ['Log Date', '2026-01-02'],
      // created_at is an instant, shown as the local date.
      ['Updated', dayjs(logs[0].created_at).format('YYYY-MM-DD')],
      ['Runtime', '12.5 h'],
      ['Logged by', 'zach'],
    ]);
    expect(dialog.querySelector('.stat-table a').getAttribute('href')).toBe(
      '#/tasks/engine-oil',
    );
    const headings = Array.from(dialog.querySelectorAll('h3')).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(['Notes', 'Files', 'Images']);
    expect(dialog.querySelector('strong').textContent).toBe('filter');
    const link = screen.getByText('yard-bill.pdf').closest('a');
    expect(link.getAttribute('href')).toBe(
      '/plugins/signalk-maintenance-tracker/api/logs/1/files/3',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(dialog.querySelector('.files-row').textContent).toContain('2.0 KB');
    const thumb = dialog.querySelector('.files-thumb');
    expect(thumb.getAttribute('href')).toBe(
      '/plugins/signalk-maintenance-tracker/api/logs/1/files/4',
    );
    expect(thumb.querySelector('img').getAttribute('alt')).toBe('impeller.jpg');
  });

  it('shows a standalone entry by title, without empty sections', async () => {
    mockFetch(apiRoutes({ logs: detailed }));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
    fireEvent.click(screen.getAllByLabelText('View log entry details')[1]);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe(
      'Log entry — Haul out, 2026-03-04',
    );
    const labels = Array.from(dialog.querySelectorAll('.stat-table th')).map(
      (th) => th.textContent,
    );
    expect(labels).toEqual([
      'Title',
      'Log Date',
      'Updated',
      'Runtime',
      'Logged by',
    ]);
    expect(dialog.querySelectorAll('h3')).toHaveLength(0);
  });
});
