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

describe('TaskFormModal — recurring toggle (v1.5)', () => {
  it('defaults to recurring on create and shows the schedule fields', () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    render(html`<${TaskFormModal} task=${null} onClose=${vi.fn()} />`);
    expect(screen.getByLabelText(/Recurring task/).checked).toBe(true);
    expect(screen.getByLabelText('Time interval')).toBeTruthy();
    expect(
      screen.getByLabelText('Runtime warning window (hours)'),
    ).toBeTruthy();
    expect(screen.getByText('New task')).toBeTruthy();
  });

  it('defaultRecurring=false opens as a todo with the schedule fields hidden', () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    render(
      html`<${TaskFormModal}
        task=${null}
        defaultRecurring=${false}
        onClose=${vi.fn()}
      />`,
    );
    expect(screen.getByLabelText(/Recurring task/).checked).toBe(false);
    expect(screen.queryByLabelText('Time interval')).toBeNull();
    expect(screen.queryByLabelText('Runtime interval (hours)')).toBeNull();
    expect(
      screen.queryByLabelText('Runtime warning window (hours)'),
    ).toBeNull();
    expect(screen.queryByText('Runtime path (SignalK)')).toBeNull();
    expect(
      screen.queryByLabelText('Last maintenance (optional seed)'),
    ).toBeNull();
    // the due date and its warning window still apply to todos
    expect(screen.getByLabelText('Due date')).toBeTruthy();
    expect(screen.getByLabelText('Time warning window (days)')).toBeTruthy();
    expect(screen.getByText('New todo')).toBeTruthy();
  });

  it('requires an interval before saving a recurring task', async () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    render(html`<${TaskFormModal} task=${null} onClose=${vi.fn()} />`);
    fireEvent.input(screen.getByLabelText('Name'), {
      target: { value: 'Oil change' },
    });
    fireEvent.submit(document.getElementById('task-form'));
    await waitFor(() =>
      expect(
        screen.getByText('A recurring task needs a runtime or time interval.'),
      ).toBeTruthy(),
    );
  });

  it('saves a todo with is_recurring=false and no schedule fields', async () => {
    const fn = mockFetch([
      TAGS_ROUTE,
      HEALTH_ROUTE,
      {
        match: (m, u) => m === 'POST' && u.indexOf('/api/tasks') !== -1,
        status: 201,
        body: { slug: 'fix-zipper' },
      },
    ]);
    const onClose = vi.fn();
    render(
      html`<${TaskFormModal}
        task=${null}
        defaultRecurring=${false}
        onClose=${onClose}
      />`,
    );
    fireEvent.input(screen.getByLabelText('Name'), {
      target: { value: 'Fix zipper' },
    });
    fireEvent.input(screen.getByLabelText('Due date'), {
      target: { value: '2026-08-15' },
    });
    fireEvent.submit(document.getElementById('task-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    const body = JSON.parse(call[1].body);
    expect(body.is_recurring).toBe(false);
    expect(body.due_date).toBe('2026-08-15');
    expect(body.runtime_interval).toBeNull();
    expect(body.time_interval).toBeNull();
    expect(body.runtime_path).toBeNull();
  });

  it('toggling a recurring task to todo submits cleared schedule fields', async () => {
    const fn = mockFetch([
      TAGS_ROUTE,
      HEALTH_ROUTE,
      {
        match: (m, u) => m === 'PUT' && u.indexOf('/api/tasks') !== -1,
        body: { slug: 'engine-oil-change' },
      },
    ]);
    const onClose = vi.fn();
    render(html`<${TaskFormModal} task=${makeTask()} onClose=${onClose} />`);
    const toggle = screen.getByLabelText(/Recurring task/);
    expect(toggle.checked).toBe(true);
    fireEvent.input(toggle, { target: { checked: false } });
    // the schedule fields disappear with the toggle off
    await waitFor(() =>
      expect(screen.queryByLabelText('Time interval')).toBeNull(),
    );

    fireEvent.submit(document.getElementById('task-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'PUT');
    const body = JSON.parse(call[1].body);
    expect(body.is_recurring).toBe(false);
    expect(body.runtime_interval).toBeNull();
    expect(body.time_interval).toBeNull();
    expect(body.runtime_path).toBeNull();
  });
});
