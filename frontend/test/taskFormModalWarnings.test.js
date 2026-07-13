import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { TaskFormModal } from '../../public/app/components/TaskFormModal.js';
import { mockFetch, makeTask } from './helpers.js';

const TAGS_ROUTE = {
  match: (m, u) => m === 'GET' && u.indexOf('/api/tags') !== -1,
  body: { data: [] },
};
const HEALTH_ROUTE = {
  match: (m, u) => m === 'GET' && u.indexOf('/api/health') !== -1,
  body: { defaults: { runtime_warning_hours: 10, time_warning_days: 7 } },
};

describe('TaskFormModal — per-task warning windows', () => {
  it('shows the plugin defaults from /health as input placeholders', async () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    render(html`<${TaskFormModal} task=${null} onClose=${vi.fn()} />`);
    await waitFor(() =>
      expect(
        screen
          .getByLabelText('Runtime warning window (hours)')
          .getAttribute('placeholder'),
      ).toBe('Default: 10'),
    );
    expect(
      screen
        .getByLabelText('Time warning window (days)')
        .getAttribute('placeholder'),
    ).toBe('Default: 7');
  });

  it('sends the entered warning windows (including 0) in the task input', async () => {
    const fn = mockFetch([
      TAGS_ROUTE,
      HEALTH_ROUTE,
      {
        match: (m, u) => m === 'POST' && u.indexOf('/api/tasks') !== -1,
        status: 201,
        body: { slug: 'reg-renewal' },
      },
    ]);
    render(html`<${TaskFormModal} task=${null} onClose=${vi.fn()} />`);

    fireEvent.input(screen.getByLabelText('Name'), {
      target: { value: 'Reg renewal' },
    });
    fireEvent.input(screen.getByLabelText('Runtime warning window (hours)'), {
      target: { value: '25' },
    });
    fireEvent.input(screen.getByLabelText('Time warning window (days)'), {
      target: { value: '0' },
    });

    fireEvent.submit(document.getElementById('task-form'));

    let call;
    await waitFor(() => {
      call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
      expect(call).toBeTruthy();
    });
    const body = JSON.parse(call[1].body);
    expect(body.runtime_warning_hours).toBe(25);
    expect(body.time_warning_days).toBe(0);
  });

  it('sends null when a window is left blank (fall back to plugin default)', async () => {
    const fn = mockFetch([
      TAGS_ROUTE,
      HEALTH_ROUTE,
      {
        match: (m, u) => m === 'POST' && u.indexOf('/api/tasks') !== -1,
        status: 201,
        body: { slug: 'reg-renewal' },
      },
    ]);
    render(html`<${TaskFormModal} task=${null} onClose=${vi.fn()} />`);

    fireEvent.input(screen.getByLabelText('Name'), {
      target: { value: 'Reg renewal' },
    });
    fireEvent.submit(document.getElementById('task-form'));

    let call;
    await waitFor(() => {
      call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
      expect(call).toBeTruthy();
    });
    const body = JSON.parse(call[1].body);
    expect(body.runtime_warning_hours).toBeNull();
    expect(body.time_warning_days).toBeNull();
  });

  it('prefills existing warning windows when editing (0 shows, null is blank)', () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    const task = makeTask({
      runtime_warning_hours: 0,
      time_warning_days: null,
    });
    render(html`<${TaskFormModal} task=${task} onClose=${vi.fn()} />`);
    expect(screen.getByLabelText('Runtime warning window (hours)').value).toBe(
      '0',
    );
    expect(screen.getByLabelText('Time warning window (days)').value).toBe('');
  });

  it('rejects a negative warning window before saving', async () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    render(html`<${TaskFormModal} task=${null} onClose=${vi.fn()} />`);
    fireEvent.input(screen.getByLabelText('Name'), {
      target: { value: 'X' },
    });
    fireEvent.input(screen.getByLabelText('Time warning window (days)'), {
      target: { value: '-2' },
    });
    fireEvent.submit(document.getElementById('task-form'));
    await waitFor(() =>
      expect(
        screen.getByText('Time warning window must be 0 or a positive number.'),
      ).toBeTruthy(),
    );
  });
});
