import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { TaskListPage } from '../../public/app/pages/TaskListPage.js';
import { AuthControl } from '../../public/app/components/AuthControl.js';
import { authState } from '../../public/app/auth/auth.js';
import { mockFetch, apiRoutes, makeTask } from './helpers.js';

describe('auth gating (§7.7)', () => {
  it('logged out: data + view are visible, write affordances are not', async () => {
    mockFetch(apiRoutes({ tasks: [makeTask()] }));
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskListPage} />`);
    await waitFor(() => expect(screen.getByText('Engine oil change')).toBeTruthy());
    expect(screen.queryByText('New task')).toBeNull();
    expect(screen.queryByLabelText('Edit Engine oil change')).toBeNull();
    expect(screen.queryByLabelText('Delete Engine oil change')).toBeNull();
    expect(screen.queryByLabelText('Complete Engine oil change')).toBeNull();
    // read affordance stays
    expect(screen.getByLabelText('View Engine oil change')).toBeTruthy();
  });

  it('logged in: write affordances render', async () => {
    mockFetch(apiRoutes({ tasks: [makeTask()] }));
    authState.value = { checked: true, isLoggedIn: true, username: 'admin' };
    render(html`<${TaskListPage} />`);
    await waitFor(() => expect(screen.getByText('Engine oil change')).toBeTruthy());
    expect(screen.getByText('New task')).toBeTruthy();
    expect(screen.getByLabelText('Edit Engine oil change')).toBeTruthy();
    expect(screen.getByLabelText('Delete Engine oil change')).toBeTruthy();
    expect(screen.getByLabelText('Complete Engine oil change')).toBeTruthy();
  });

  it('AuthControl shows Log in when anonymous, username + logout when authenticated', () => {
    authState.value = { checked: true, isLoggedIn: false, username: null };
    const { rerender } = render(html`<${AuthControl} />`);
    expect(screen.getByText('Log in')).toBeTruthy();

    authState.value = { checked: true, isLoggedIn: true, username: 'skipper' };
    rerender(html`<${AuthControl} />`);
    expect(screen.getByText('skipper')).toBeTruthy();
    expect(screen.getByLabelText('Log out')).toBeTruthy();
  });
});
