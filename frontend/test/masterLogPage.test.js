import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
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

describe('master log page — attachments', () => {
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
  const withFiles = [
    { ...logs[0], files: [pdf, jpg] },
    { ...logs[1], files: [] },
  ];

  it('marks entries with files with a green paperclip, visible logged out', async () => {
    mockFetch(apiRoutes({ logs: withFiles }));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
    const clips = screen.getAllByLabelText('View attachments');
    expect(clips).toHaveLength(1);
    expect(clips[0].className).toContain('success');
    expect(clips[0].getAttribute('title')).toBe('2 attachments');
    expect(clips[0].closest('tr').textContent).toContain('Engine oil');
    expect(screen.queryByLabelText('Edit log entry')).toBeNull();
  });

  it('puts the paperclip before the edit icon when logged in', async () => {
    mockFetch(apiRoutes({ logs: withFiles }));
    authState.value = { checked: true, isLoggedIn: true, username: 'admin' };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
    const cell = screen.getByLabelText('View attachments').closest('td');
    const labels = Array.from(cell.querySelectorAll('button')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels).toEqual([
      'View attachments',
      'Edit log entry',
      'Delete log entry',
    ]);
    // an entry without files keeps just edit/delete
    expect(screen.getAllByLabelText('Edit log entry')).toHaveLength(2);
  });

  it('opens a modal listing Files and Images, served from the log file routes', async () => {
    mockFetch(apiRoutes({ logs: withFiles }));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${MasterLogPage} />`);
    await waitFor(() => expect(screen.getByText('Haul out')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('View attachments'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toMatch(
      /^Attachments — Engine oil, /,
    );
    const headings = Array.from(dialog.querySelectorAll('h3')).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(['Files', 'Images']);
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
    // the table itself stays free of inline files
    expect(document.querySelectorAll('.files-thumb')).toHaveLength(1);
  });
});
