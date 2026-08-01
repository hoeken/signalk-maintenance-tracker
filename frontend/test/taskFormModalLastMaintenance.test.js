import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
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

/** Both fields are derived from the latest log entry (#4), so edit mode
 * explains where to change them instead of offering inputs. */
describe('TaskFormModal — last maintenance in edit mode', () => {
  it('offers the seed inputs on create', () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    render(html`<${TaskFormModal} task=${null} onClose=${vi.fn()} />`);
    expect(
      screen.getByLabelText('Last maintenance (optional seed)'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Runtime at last maintenance (h)'),
    ).toBeTruthy();
    expect(screen.queryByText(/Mark complete/)).toBeNull();
  });

  it('replaces the seed inputs with a note pointing at Mark complete', () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    render(html`<${TaskFormModal} task=${makeTask()} onClose=${vi.fn()} />`);
    expect(
      screen.queryByLabelText('Last maintenance (optional seed)'),
    ).toBeNull();
    expect(
      screen.queryByLabelText('Runtime at last maintenance (h)'),
    ).toBeNull();
    expect(screen.getByText('Mark complete')).toBeTruthy();
    expect(screen.getByText(/most recent log entry/)).toBeTruthy();
    expect(screen.getByText(/maintenance log/)).toBeTruthy();
  });

  // htm drops whitespace-only runs that contain a newline, so text sitting
  // against an inline element needs an explicit ${' '} or it renders as
  // "UseMark complete".
  it('keeps spaces around the inline <strong> in the note', () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    render(html`<${TaskFormModal} task=${makeTask()} onClose=${vi.fn()} />`);
    const note = screen.getByText(/most recent log entry/);
    const text = note.textContent.replace(/\s+/g, ' ').trim();
    expect(text).toContain('editable here. Use Mark complete to record work');
    expect(text).not.toMatch(/\bUseMark\b/);
  });

  it('shows the current derived values read-only', () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    render(html`<${TaskFormModal} task=${makeTask()} onClose=${vi.fn()} />`);
    expect(screen.getByText('2026-01-15')).toBeTruthy();
    expect(screen.getByText('1240.5 h')).toBeTruthy();
  });

  it('renders an em dash for a task that has never been completed', () => {
    mockFetch([TAGS_ROUTE, HEALTH_ROUTE]);
    const task = makeTask({ last_maintenance: null, last_runtime: null });
    render(html`<${TaskFormModal} task=${task} onClose=${vi.fn()} />`);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('does not send last_maintenance or last_runtime when saving an edit', async () => {
    const fn = mockFetch([
      TAGS_ROUTE,
      HEALTH_ROUTE,
      {
        match: (m, u) => m === 'PUT' && u.indexOf('/api/tasks') !== -1,
        body: { slug: 'engine-oil-change' },
      },
    ]);
    render(html`<${TaskFormModal} task=${makeTask()} onClose=${vi.fn()} />`);
    fireSubmit();
    let call;
    await waitFor(() => {
      call = fn.mock.calls.find((c) => c[1] && c[1].method === 'PUT');
      expect(call).toBeTruthy();
    });
    const body = JSON.parse(call[1].body);
    expect(body.last_maintenance).toBeUndefined();
    expect(body.last_runtime).toBeUndefined();
  });
});

function fireSubmit() {
  const form = document.getElementById('task-form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
