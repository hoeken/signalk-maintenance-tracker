import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTask, mockFetch, renderWithProviders } from '../test/utils';
import { CompleteModal } from './LogEntryModal';

afterEach(() => vi.unstubAllGlobals());

describe('CompleteModal (§7.5)', () => {
  it('prefills runtime hours from the task current_runtime and posts a log entry', async () => {
    const fetchMock = mockFetch([
      { match: 'GET /skServer/loginStatus', body: { status: 'loggedIn', username: 'admin' } },
      {
        match: 'POST /plugins/signalk-maintenance-tracker/api/tasks/engine-oil-change/logs',
        status: 201,
        body: { id: 1 },
      },
    ]);
    const task = makeTask({ current_runtime: 1360 });
    const onClose = vi.fn();
    renderWithProviders(<CompleteModal opened onClose={onClose} task={task} />);

    // prefilled from the plugin /tasks API value, not SignalK (§8.4)
    const runtime = await screen.findByLabelText('Runtime hours');
    expect(runtime).toHaveValue('1360');

    await userEvent.type(screen.getByLabelText('Notes (markdown)'), 'Replaced filter');
    await userEvent.click(screen.getByRole('button', { name: 'Mark complete' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([url, init]) =>
      `${(init as RequestInit)?.method} ${url}`.includes(
        'POST /plugins/signalk-maintenance-tracker/api/tasks/engine-oil-change/logs'
      )
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.runtime_hours).toBe(1360);
    expect(body.notes).toBe('Replaced filter');
    expect(typeof body.maintenance_date).toBe('string');
    expect(body.logged_by).toBeUndefined(); // server stamps it (§9.1)
  });

  it('shows an empty (optional) runtime field for tasks without a runtime path', async () => {
    // informational tasks can still be completed; runtime is manual/optional
    mockFetch([{ match: 'GET /skServer/loginStatus', body: { status: 'loggedIn', username: 'admin' } }]);
    const task = makeTask({
      runtime_path: null,
      current_runtime: null,
      runtime_interval: null,
      time_interval: null,
    });
    renderWithProviders(<CompleteModal opened onClose={() => {}} task={task} />);
    await screen.findByRole('button', { name: 'Mark complete' });
    expect(screen.getByLabelText('Runtime hours')).toHaveValue('');
  });
});
