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

describe('TaskDetailPage — schedule card', () => {
  it('shows last-done date and elapsed time with no interval or due date', async () => {
    await renderTask({
      time_interval: null,
      time_interval_unit: null,
      due_date: null,
      scheduled_due_date: null,
      scheduled_remaining_ms: null,
      scheduled_fraction: null,
      scheduled_status: null,
      last_maintenance: '2026-06-09T12:00:00.000Z',
      elapsed_time_ms: 30 * 86400000,
    });
    expect(screen.getByText('Last done — no interval')).toBeTruthy();
    expect(screen.getByText('2026-06-09')).toBeTruthy();
    expect(screen.getByText('30 days ago')).toBeTruthy();
  });

  it('shows current and elapsed runtime with no runtime interval', async () => {
    await renderTask({
      runtime_interval: null,
      remaining_runtime: null,
      due_runtime_at: null,
      runtime_fraction: null,
      runtime_status: null,
    });
    expect(screen.getByText('Runtime — no interval')).toBeTruthy();
    expect(screen.getByText('1360 h')).toBeTruthy();
    expect(
      screen.getByText(/Last done at 1240.5 h · 119.5 h since/),
    ).toBeTruthy();
  });

  it('omits the elapsed-runtime note when no reading pairs with the log', async () => {
    await renderTask({
      runtime_interval: null,
      remaining_runtime: null,
      due_runtime_at: null,
      runtime_fraction: null,
      runtime_status: null,
      current_runtime: null,
      elapsed_runtime: null,
    });
    expect(screen.getByText('Runtime — no interval')).toBeTruthy();
    expect(screen.getByText(/Last done at 1240.5 h/)).toBeTruthy();
    expect(screen.queryByText(/since/)).toBeNull();
  });

  it('leaves the configured rows alone (no duplicate fallbacks)', async () => {
    await renderTask({});
    expect(screen.queryByText('Runtime — no interval')).toBeNull();
    expect(screen.queryByText('Last done — no interval')).toBeNull();
    expect(screen.getByText('Runtime — every 200 h')).toBeTruthy();
    expect(screen.getByText('Time — every 12 months')).toBeTruthy();
  });

  it('still calls a task with nothing logged informational', async () => {
    await renderTask({
      runtime_interval: null,
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
    });
    expect(
      screen.getByText('Informational task — no intervals configured.'),
    ).toBeTruthy();
  });
});
