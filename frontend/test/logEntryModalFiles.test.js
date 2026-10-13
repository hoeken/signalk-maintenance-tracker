import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { LogEntryModal } from '../../public/app/components/LogEntryModal.js';
import { toasts } from '../../public/app/lib/toasts.js';
import { mockFetch, makeTask } from './helpers.js';

const API = '/plugins/signalk-maintenance-tracker/api';

/**
 * Minimal XMLHttpRequest stand-in: records what each upload sent and
 * answers on the next tick — with a file record echoing the headers on
 * success, or the given error body.
 */
function fakeXhr(status, errorBody) {
  const sent = [];
  let nextId = 100;
  class FakeXMLHttpRequest {
    constructor() {
      this.headers = {};
      this.upload = {};
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(k, v) {
      this.headers[k] = v;
    }
    send(payload) {
      sent.push({
        method: this.method,
        url: this.url,
        headers: this.headers,
        payload,
        at: Date.now(),
      });
      setTimeout(() => {
        if (this.upload.onprogress)
          this.upload.onprogress({
            lengthComputable: true,
            loaded: 1,
            total: 2,
          });
        this.status = status;
        this.responseText = JSON.stringify(
          status < 300
            ? {
                id: nextId++,
                name: decodeURIComponent(this.headers['X-File-Name']),
                size: payload.size,
                mime: this.headers['X-File-Type'] || null,
                created_at: '2026-07-01T00:00:00.000Z',
              }
            : errorBody,
        );
        this.onload();
      }, 0);
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  return sent;
}

const photo = new File(['jpegbytes'], 'photo.jpg', { type: 'image/jpeg' });
const receipt = new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' });

function pick(files) {
  fireEvent.change(screen.getByLabelText('Upload file'), {
    target: { files: files },
  });
}

const entry = {
  id: 7,
  task_id: 1,
  title: null,
  maintenance_date: '2026-07-01T10:00:00.000Z',
  runtime_hours: 1300,
  notes: 'old note',
  logged_by: 'admin',
  created_at: '2026-07-01T10:00:00.000Z',
  task_slug: 'engine-oil-change',
  task_name: 'Engine oil change',
  files: [
    {
      id: 3,
      name: 'before.jpg',
      size: 800,
      mime: 'image/jpeg',
      created_at: '2026-07-01T10:00:00.000Z',
    },
  ],
};

describe('LogEntryModal — files on mark complete', () => {
  it('queues picked files and uploads them to the new entry once it is saved', async () => {
    const fn = mockFetch([
      {
        match: (m, u) =>
          m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change', files: [] },
      },
    ]);
    const sent = fakeXhr(201);
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${makeTask()} onClose=${onClose} />`);
    // The field sits after Notes.
    const notes = screen.getByLabelText('Notes (markdown)').closest('.field');
    expect(notes.nextElementSibling.textContent).toContain('Files');
    expect(screen.getByText(/Uploaded when the entry is saved/)).toBeTruthy();

    pick([photo, receipt]);
    const rows = Array.from(document.querySelectorAll('.files-row')).map((li) =>
      li.textContent.trim(),
    );
    expect(rows).toEqual(['photo.jpg9 B', 'receipt.pdf4 B']);
    // nothing has gone anywhere yet: there is no entry to attach to
    expect(sent).toHaveLength(0);

    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const post = fn.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    expect(post).toBeTruthy();
    expect(sent).toHaveLength(2);
    expect(sent.map((s) => s.url)).toEqual([
      API + '/logs/9/files',
      API + '/logs/9/files',
    ]);
    expect(sent[0].method).toBe('POST');
    expect(sent[0].headers['Content-Type']).toBe('application/octet-stream');
    expect(sent[0].headers['X-File-Name']).toBe('photo.jpg');
    expect(sent[0].headers['X-File-Type']).toBe('image/jpeg');
    expect(sent[0].payload).toBe(photo);
    expect(sent[1].headers['X-File-Name']).toBe('receipt.pdf');
    expect(sent[1].payload).toBe(receipt);
  });

  it('lets a queued file be removed before saving', async () => {
    mockFetch([
      {
        match: (m, u) =>
          m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change', files: [] },
      },
    ]);
    const sent = fakeXhr(201);
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${makeTask()} onClose=${onClose} />`);
    pick([photo, receipt]);
    fireEvent.click(screen.getByLabelText('Remove photo.jpg'));
    expect(screen.queryByText('photo.jpg')).toBeNull();
    expect(screen.getByText('receipt.pdf')).toBeTruthy();
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent.map((s) => s.headers['X-File-Name'])).toEqual(['receipt.pdf']);
  });

  it('attaches to a new standalone entry the same way', async () => {
    mockFetch([
      {
        match: (m, u) => m === 'POST' && u.indexOf('/api/logs') !== -1,
        status: 201,
        body: { id: 12, task_id: null, title: 'Haul out', files: [] },
      },
    ]);
    const sent = fakeXhr(201);
    const onClose = vi.fn();
    render(html`<${LogEntryModal} onClose=${onClose} />`);
    fireEvent.input(screen.getByLabelText('Title'), {
      target: { value: 'Haul out' },
    });
    pick([receipt]);
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(API + '/logs/12/files');
  });

  it('reports a failed upload but still closes — the entry itself is saved', async () => {
    mockFetch([
      {
        match: (m, u) =>
          m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change', files: [] },
      },
    ]);
    fakeXhr(413, {
      error: { code: 'file_too_large', message: 'Files are limited to 1 GB' },
    });
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${makeTask()} onClose=${onClose} />`);
    pick([photo]);
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const failure = toasts.value.find((t) => t.kind === 'error');
    expect(failure.message).toContain('photo.jpg');
    expect(failure.message).toContain('Files are limited to 1 GB');
  });

  it('offers no file field at all without picking anything, and sends nothing', async () => {
    mockFetch([
      {
        match: (m, u) =>
          m === 'POST' && u.indexOf('/api/tasks/engine-oil-change/logs') !== -1,
        status: 201,
        body: { id: 9, task_slug: 'engine-oil-change', files: [] },
      },
    ]);
    const sent = fakeXhr(201);
    const onClose = vi.fn();
    render(html`<${LogEntryModal} task=${makeTask()} onClose=${onClose} />`);
    fireEvent.submit(document.getElementById('log-form'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent).toHaveLength(0);
  });
});

describe('LogEntryModal — files on edit', () => {
  it("lists the entry's files and uploads a new one straight to it", async () => {
    mockFetch([]);
    const sent = fakeXhr(201);
    render(html`<${LogEntryModal} entry=${entry} onClose=${() => {}} />`);
    const row = screen.getByText('before.jpg').closest('li');
    expect(row.textContent).toContain('800 B');
    expect(screen.getByLabelText('Delete before.jpg')).toBeTruthy();
    expect(screen.getByText(/apply immediately/)).toBeTruthy();

    pick([photo]);
    await waitFor(() => expect(screen.getByText('photo.jpg')).toBeTruthy());
    // no submit needed: the entry exists, so the upload went right away
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(API + '/logs/7/files');
    expect(sent[0].headers['X-File-Name']).toBe('photo.jpg');
    expect(screen.queryByText(/Uploading/)).toBeNull();
  });

  it('asks before deleting, then DELETEs /logs/:id/files/:fileId', async () => {
    const fn = mockFetch([
      {
        match: (m, u) => m === 'DELETE' && u.indexOf('/logs/7/files/3') !== -1,
        status: 204,
      },
    ]);
    render(html`<${LogEntryModal} entry=${entry} onClose=${() => {}} />`);
    fireEvent.click(screen.getByLabelText('Delete before.jpg'));
    expect(fn.mock.calls.some((c) => c[1] && c[1].method === 'DELETE')).toBe(
      false,
    );
    fireEvent.click(
      screen.getByText('Delete', { selector: '.files-confirm *' }),
    );
    await waitFor(() => expect(screen.queryByText('before.jpg')).toBeNull());
    const del = fn.mock.calls.find((c) => c[1] && c[1].method === 'DELETE');
    expect(String(del[0])).toBe(API + '/logs/7/files/3');
  });
});
