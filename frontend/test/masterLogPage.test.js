import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
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
