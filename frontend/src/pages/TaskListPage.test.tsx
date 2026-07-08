import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTask, mockFetch, page, renderWithProviders } from '../test/utils';
import { TaskListPage } from './TaskListPage';

afterEach(() => vi.unstubAllGlobals());

const taskRoutes = (loggedIn: boolean) => [
  {
    match: 'GET /skServer/loginStatus',
    body: { status: loggedIn ? 'loggedIn' : 'notLoggedIn', username: 'admin' },
  },
  {
    match: 'GET /plugins/signalk-maintenance-tracker/api/tasks',
    body: page([
      makeTask(),
      makeTask({ id: 2, slug: 'zinc-check', name: 'Zinc check', status: 'overdue', tags: ['Hull'] }),
    ]),
  },
  {
    match: 'GET /plugins/signalk-maintenance-tracker/api/tags',
    body: { data: [{ id: 1, name: 'Engines', count: 1 }, { id: 2, name: 'Hull', count: 1 }] },
  },
];

describe('TaskListPage auth gating (§7.7)', () => {
  it('logged out: shows data and view action, hides all write affordances', async () => {
    mockFetch(taskRoutes(false));
    renderWithProviders(<TaskListPage />);

    expect(await screen.findByText('Engine oil change')).toBeInTheDocument();
    expect(screen.getByText('Zinc check')).toBeInTheDocument();
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);

    expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Edit Engine oil change/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Delete Engine oil change/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Complete Engine oil change/)).not.toBeInTheDocument();
  });

  it('logged in: shows New task button and per-row write actions', async () => {
    mockFetch(taskRoutes(true));
    renderWithProviders(<TaskListPage />);

    expect(await screen.findByText('Engine oil change')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'New task' })).toBeInTheDocument();
    expect(screen.getByLabelText('Edit Engine oil change')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete Engine oil change')).toBeInTheDocument();
    expect(screen.getByLabelText('Complete Engine oil change')).toBeInTheDocument();
  });

  it('shows an empty state when there are no tasks', async () => {
    mockFetch([
      { match: 'GET /skServer/loginStatus', body: { status: 'notLoggedIn' } },
      { match: 'GET /plugins/signalk-maintenance-tracker/api/tasks', body: page([]) },
      { match: 'GET /plugins/signalk-maintenance-tracker/api/tags', body: { data: [] } },
    ]);
    renderWithProviders(<TaskListPage />);
    expect(await screen.findByText('No tasks')).toBeInTheDocument();
  });
});
