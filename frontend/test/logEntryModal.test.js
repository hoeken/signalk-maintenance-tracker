import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { LogEntryModal } from '../../public/app/components/LogEntryModal.js';
import { mockFetch, makeTask } from './helpers.js';

describe('LogEntryModal — mark complete (§7.5)', () => {
  it('prefills runtime hours from the task current_runtime (plugin API value, §8.4)', () => {
    mockFetch([]);
    render(html`<${LogEntryModal} task=${makeTask({ current_runtime: 1360 })} onClose=${() => {}} />`);
    expect(screen.getByLabelText('Runtime hours').value).toBe('1360');
  });

  it('rounds the prefilled runtime to 0.1 h like the rest of the UI', () => {
    mockFetch([]);
    render(
      html`<${LogEntryModal} task=${makeTask({ current_runtime: 1360.2588888888889 })} onClose=${() => {}} />`
    );
    expect(screen.getByLabelText('Runtime hours').value).toBe('1360.3');
  });

  it('shows an empty runtime field for tasks without a runtime path', () => {
    mockFetch([]);
    render(
      html`<${LogEntryModal}
        task=${makeTask({ runtime_path: null, current_runtime: null })}
        onClose=${() => {}}
      />`
    );
    expect(screen.getByLabelText('Runtime hours').value).toBe('');
  });

  it('POSTs the log entry and closes', async () => {
    const fn = mockFetch([
      {
        match: (m, u) => m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change' },
      },
    ]);
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${makeTask()} onClose=${onClose} />`);
    fireEvent.input(screen.getByLabelText('Notes (markdown)'), { target: { value: 'Replaced filter.' } });
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    const body = JSON.parse(call[1].body);
    expect(body.runtime_hours).toBe(1360);
    expect(body.notes).toBe('Replaced filter.');
    expect(body.maintenance_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('edits an existing entry via PUT /logs/:id', async () => {
    const fn = mockFetch([
      {
        match: (m, u) => m === 'PUT' && u.indexOf('/api/logs/7') !== -1,
        body: { id: 7, task_slug: 'engine-oil-change' },
      },
    ]);
    const onClose = vi.fn();
    const entry = {
      id: 7,
      task_id: 1,
      maintenance_date: '2026-07-01T10:00:00.000Z',
      runtime_hours: 1300,
      notes: 'old note',
      logged_by: 'admin',
      created_at: '2026-07-01T10:00:00.000Z',
      task_slug: 'engine-oil-change',
      task_name: 'Engine oil change',
    };
    render(html`<${LogEntryModal} entry=${entry} onClose=${onClose} />`);
    expect(screen.getByLabelText('Runtime hours').value).toBe('1300');
    fireEvent.input(screen.getByLabelText('Notes (markdown)'), { target: { value: 'corrected' } });
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = fn.mock.calls.find((c) => c[1] && c[1].method === 'PUT');
    expect(JSON.parse(call[1].body).notes).toBe('corrected');
  });
});
