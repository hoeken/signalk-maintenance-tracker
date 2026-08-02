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
          makeTask({
            id: 1,
            name: 'Engine oil change',
            status: 'overdue',
            remaining_runtime: -20,
            tags: ['Engines'],
          }),
          makeTask({
            id: 2,
            slug: 'winch-service',
            name: 'Winch service',
            status: 'ok',
          }),
        ],
        tags: [{ id: 1, name: 'Engines', count: 1 }],
      }),
    );
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskListPage} />`);
    await waitFor(() =>
      expect(screen.getByText('Engine oil change')).toBeTruthy(),
    );
    expect(screen.getByText('Winch service')).toBeTruthy();
    // the row badge, not the same-named status filter chip
    expect(document.querySelector('.badge.overdue')?.textContent).toBe(
      'Overdue',
    );
    expect(screen.getByText('20 h overdue')).toBeTruthy();
    // task detail links use hash routes
    expect(screen.getByText('Engine oil change').getAttribute('href')).toBe(
      '#/tasks/engine-oil-change',
    );
  });

  it('sends filters from the URL hash to the API', async () => {
    const fn = mockFetch(apiRoutes({ tasks: [] }));
    route.value = parseHash(
      '#/?search=oil&tags=Engines&status=overdue,due_soon&sort=name&order=desc&page=2',
    );
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskListPage} />`);
    await waitFor(() => {
      const tasksCall = fn.mock.calls.find(
        (c) => String(c[0]).indexOf('/api/tasks?') !== -1,
      );
      expect(tasksCall).toBeTruthy();
      const url = String(tasksCall[0]);
      expect(url).toContain('search=oil');
      expect(url).toContain('tags=Engines');
      expect(url).toContain('status=overdue%2Cdue_soon');
      expect(url).toContain('sort=name');
      expect(url).toContain('order=desc');
      expect(url).toContain('page=2');
    });
  });

  it('status chips carry the count each would return', async () => {
    mockFetch(
      apiRoutes({
        tasks: [
          makeTask({ id: 1, status: 'overdue' }),
          makeTask({ id: 2, slug: 'winch', name: 'Winch', status: 'overdue' }),
          makeTask({ id: 3, slug: 'zincs', name: 'Zincs', status: 'ok' }),
        ],
      }),
    );
    route.value = parseHash('#/');
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskListPage} />`);

    await waitFor(() => expect(screen.getByText('Zincs')).toBeTruthy());
    const chips = Array.from(document.querySelectorAll('.chips .chip')).map(
      (el) => el.textContent.trim(),
    );
    // counts come from the server's facets, so they cover every page, and an
    // empty status still shows its zero
    expect(chips).toEqual(['Overdue2', 'Due Soon0', 'OK1', 'Info0']);
    // no tags defined, so that row (and its label) is left out entirely
    expect(
      Array.from(document.querySelectorAll('.chips-label')).map(
        (el) => el.textContent,
      ),
    ).toEqual(['Status:']);
  });

  it('tag chips single-select: a second tag replaces the first, and the selected one clears', async () => {
    mockFetch(
      apiRoutes({
        tasks: [],
        tags: [
          { id: 1, name: 'Engines', count: 3 },
          { id: 2, name: 'Rigging', count: 2 },
        ],
      }),
    );
    route.value = parseHash('#/?page=4');
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskListPage} />`);
    await waitFor(() => expect(screen.getByText('Engines')).toBeTruthy());

    fireEvent.click(screen.getByText('Engines'));
    await waitFor(() => {
      expect(route.value.query.tags).toBe('Engines');
      expect(route.value.query.page).toBeUndefined();
    });

    // one click to switch categories — no deselect first, and no AND of the two
    fireEvent.click(screen.getByText('Rigging'));
    await waitFor(() => expect(route.value.query.tags).toBe('Rigging'));

    fireEvent.click(screen.getByText('Rigging'));
    await waitFor(() => expect(route.value.query.tags).toBeUndefined());
  });

  it('status chips single-select and filter alongside the other options', async () => {
    mockFetch(
      apiRoutes({ tasks: [], tags: [{ id: 1, name: 'Engines', count: 3 }] }),
    );
    route.value = parseHash('#/?search=oil&tags=Engines&page=4');
    authState.value = { checked: true, isLoggedIn: false, username: null };
    render(html`<${TaskListPage} />`);

    // one chip per status, on their own labelled row below the tags
    await waitFor(() => expect(screen.getByText('Engines')).toBeTruthy());
    const rows = Array.from(document.querySelectorAll('.chip-filters .chips'));
    expect(
      rows.map((r) => r.querySelector('.chips-label').textContent),
    ).toEqual(['Tags:', 'Status:']);
    expect(
      Array.from(rows[1].querySelectorAll('.chip')).map((el) =>
        el.textContent.trim(),
      ),
    ).toEqual(['Overdue0', 'Due Soon0', 'OK0', 'Info0']);
    const chips = Array.from(document.querySelectorAll('.chips .chip')).map(
      (el) => el.textContent.trim(),
    );
    expect(chips).toEqual([
      'Engines3',
      'Overdue0',
      'Due Soon0',
      'OK0',
      'Info0',
    ]);

    fireEvent.click(screen.getByText('Due Soon'));
    await waitFor(() => expect(route.value.query.status).toBe('due_soon'));
    // ANDed with the existing filters, not replacing them; paging resets
    expect(route.value.query.search).toBe('oil');
    expect(route.value.query.tags).toBe('Engines');
    expect(route.value.query.page).toBeUndefined();

    // a task only ever has one status, so the second chip replaces the first
    fireEvent.click(screen.getByText('Overdue'));
    await waitFor(() => expect(route.value.query.status).toBe('overdue'));

    fireEvent.click(screen.getByText('Overdue'));
    await waitFor(() => expect(route.value.query.status).toBeUndefined());
  });
});
