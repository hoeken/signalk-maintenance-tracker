import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { TaskFormModal } from '../../public/app/components/TaskFormModal.js';
import { mockFetch, makeTask } from './helpers.js';

const TAGS_ROUTE = {
  match: (m, u) => m === 'GET' && u.indexOf('/api/tags') !== -1,
  body: { data: [] },
};

const manual = {
  id: 3,
  name: 'Yanmar manual.pdf',
  size: 2.5 * 1024 * 1024,
  mime: 'application/pdf',
  created_at: '2026-01-01T00:00:00.000Z',
};

/**
 * Minimal XMLHttpRequest stand-in: records what the upload sent and answers
 * with the given status/body on the next tick, after one progress event.
 */
function fakeXhr(status, body) {
  const sent = [];
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
      });
      setTimeout(() => {
        if (this.upload.onprogress)
          this.upload.onprogress({
            lengthComputable: true,
            loaded: 1,
            total: 2,
          });
        this.status = status;
        this.responseText = JSON.stringify(body);
        this.onload();
      }, 0);
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  return sent;
}

describe('TaskFormModal — files', () => {
  it('tells a new task to be saved before attaching files', () => {
    mockFetch([TAGS_ROUTE]);
    render(html`<${TaskFormModal} task=${null} onClose=${() => {}} />`);
    expect(screen.getByText('Files')).toBeTruthy();
    expect(
      screen.getByText('Save the task first, then edit it to attach files.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Upload file')).toBeNull();
  });

  it('lists the existing attachments with sizes when editing', () => {
    mockFetch([TAGS_ROUTE]);
    render(
      html`<${TaskFormModal} task=${makeTask({ files: [manual] })} onClose=${() => {}} />`,
    );
    const row = screen.getByText('Yanmar manual.pdf').closest('li');
    expect(row.textContent).toContain('2.5 MB');
    expect(screen.getByLabelText('Delete Yanmar manual.pdf')).toBeTruthy();
    expect(screen.getByLabelText('Upload file')).toBeTruthy();
  });

  it('uploads a picked file as a raw body and adds it to the list', async () => {
    mockFetch([TAGS_ROUTE]);
    const saved = {
      id: 9,
      name: 'receipt.jpg',
      size: 800,
      mime: 'image/jpeg',
      created_at: '2026-02-01T00:00:00.000Z',
    };
    const sent = fakeXhr(201, saved);
    render(html`<${TaskFormModal} task=${makeTask()} onClose=${() => {}} />`);

    const file = new File(['jpegbytes'], 'receipt.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Upload file'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(screen.getByText('receipt.jpg')).toBeTruthy());
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('POST');
    expect(sent[0].url).toBe(
      '/plugins/signalk-maintenance-tracker/api/tasks/engine-oil-change/files',
    );
    expect(sent[0].headers['Content-Type']).toBe('application/octet-stream');
    expect(sent[0].headers['X-File-Name']).toBe('receipt.jpg');
    expect(sent[0].headers['X-File-Type']).toBe('image/jpeg');
    expect(sent[0].payload).toBe(file);
    expect(screen.getByText('receipt.jpg').closest('li').textContent).toContain(
      '800 B',
    );
    expect(screen.queryByText(/Uploading/)).toBeNull();
  });

  it('shows the server error when an upload is rejected', async () => {
    mockFetch([TAGS_ROUTE]);
    fakeXhr(413, {
      error: { code: 'file_too_large', message: 'Files are limited to 1 GB' },
    });
    render(html`<${TaskFormModal} task=${makeTask()} onClose=${() => {}} />`);
    fireEvent.change(screen.getByLabelText('Upload file'), {
      target: { files: [new File(['x'], 'huge.bin')] },
    });
    await waitFor(() =>
      expect(screen.getByText('Files are limited to 1 GB')).toBeTruthy(),
    );
    expect(screen.queryByText('huge.bin')).toBeNull();
  });

  it('asks before deleting, then removes the file', async () => {
    const fn = mockFetch([
      TAGS_ROUTE,
      {
        match: (m, u) => m === 'DELETE' && u.indexOf('/files/3') !== -1,
        status: 204,
      },
    ]);
    render(
      html`<${TaskFormModal} task=${makeTask({ files: [manual] })} onClose=${() => {}} />`,
    );
    fireEvent.click(screen.getByLabelText('Delete Yanmar manual.pdf'));
    // nothing sent yet — the row offers an inline confirmation instead
    expect(fn.mock.calls.some((c) => c[1] && c[1].method === 'DELETE')).toBe(
      false,
    );
    fireEvent.click(
      screen.getByText('Cancel', { selector: '.files-confirm *' }),
    );
    expect(screen.getByLabelText('Delete Yanmar manual.pdf')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Delete Yanmar manual.pdf'));
    fireEvent.click(
      screen.getByText('Delete', { selector: '.files-confirm *' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Yanmar manual.pdf')).toBeNull(),
    );
    const del = fn.mock.calls.find((c) => c[1] && c[1].method === 'DELETE');
    expect(String(del[0])).toBe(
      '/plugins/signalk-maintenance-tracker/api/tasks/engine-oil-change/files/3',
    );
  });
});
