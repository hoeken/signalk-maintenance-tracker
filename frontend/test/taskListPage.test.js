import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { TaskListPage } from '../../public/app/pages/TaskListPage.js';
import { authState } from '../../public/app/auth/auth.js';
import { route, parseHash } from '../../public/app/lib/router.js';
import { mockFetch, apiRoutes, makeTask } from './helpers.js';

describe('TaskListPage (§7.4)', () => {
  it('renders rows with status, remaining values, and tags', async () => {
    mockFetch(
      apiRoutes({
        tasks: [
          makeTask({ id: 1, name: 'Engine oil change', status: 'overdue', remaining_runtime: -20, tags: ['Engines'] }),
          makeTask({ id: 2, slug: 'winch-service', name: 'Winch service', status: 'ok' }),
        ],
        tags: [{ id: 1, name: 'Engines', count: 1 }],
      })
    );
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskListPage} />`);
    await waitFor(() => expect(screen.getByText('Engine oil change')).toBeTruthy());
    expect(screen.getByText('Winch service')).toBeTruthy();
    expect(screen.getByText('overdue')).toBeTruthy();
    expect(screen.getByText('20 h overdue')).toBeTruthy();
    // task detail links use hash routes
    expect(screen.getByText('Engine oil change').getAttribute('href')).toBe('#/tasks/engine-oil-change');
  });

  it('sends filters from the URL hash to the API', async () => {
    const fn = mockFetch(apiRoutes({ tasks: [] }));
    route.value = parseHash('#/?search=oil&tags=Engines&sort=name&order=desc&page=2');
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskListPage} />`);
    await waitFor(() => {
      const tasksCall = fn.mock.calls.find((c) => String(c[0]).indexOf('/api/tasks?') !== -1);
      expect(tasksCall).toBeTruthy();
      const url = String(tasksCall[0]);
      expect(url).toContain('search=oil');
      expect(url).toContain('tags=Engines');
      expect(url).toContain('sort=name');
      expect(url).toContain('order=desc');
      expect(url).toContain('page=2');
    });
  });

  it('toggling a tag chip updates the hash query and resets the page', async () => {
    mockFetch(apiRoutes({ tasks: [], tags: [{ id: 1, name: 'Engines', count: 3 }] }));
    route.value = parseHash('#/?page=4');
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskListPage} />`);
    await waitFor(() => expect(screen.getByText('Engines')).toBeTruthy());
    fireEvent.click(screen.getByText('Engines'));
    await waitFor(() => {
      expect(route.value.query.tags).toBe('Engines');
      expect(route.value.query.page).toBeUndefined();
    });
  });
});
