import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { DownloadLogModal } from '../../public/app/components/DownloadLogModal.js';
import { readZip } from './helpers.js';

const API = '/plugins/signalk-maintenance-tracker/api';

/** @type {import('../../public/app/types.js').LogDTO[]} */
const entries = [
  {
    id: 7,
    task_id: 1,
    title: null,
    maintenance_date: '2026-01-02T00:00:00.000Z',
    runtime_hours: 10,
    notes: 'Oil',
    logged_by: 'zach',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: null,
    task_slug: 'engine-oil',
    task_name: 'Engine oil',
    files: [
      {
        id: 70,
        name: 'receipt.pdf',
        size: 3,
        mime: 'application/pdf',
        created_at: '',
      },
    ],
  },
  {
    id: 8,
    task_id: null,
    title: 'Haul out',
    maintenance_date: '2026-03-04',
    runtime_hours: null,
    notes: null,
    logged_by: null,
    created_at: '2026-03-04T00:00:00Z',
    updated_at: null,
    task_slug: null,
    task_name: null,
    files: [],
  },
];

/** @type {{ blob: Blob, name: string }[]} */
let downloads;

beforeEach(() => {
  downloads = [];
  /** @type {Blob|null} */
  let last = null;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (/** @type {Blob} */ b) => ((last = b), 'blob:x'),
    revokeObjectURL: () => {},
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    function () {
      downloads.push({ blob: /** @type {Blob} */ (last), name: this.download });
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) =>
      String(url) === API + '/logs/7/files/70'
        ? new Response(new Uint8Array([1, 2, 3]))
        : new Response('nope', { status: 404 }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderModal(onClose = vi.fn()) {
  render(
    html`<${DownloadLogModal}
      filenameBase="signalk-maintenance-log"
      fetchEntries=${async () => entries}
      onClose=${onClose}
    />`,
  );
  return onClose;
}

/** @param {Blob} blob */
const text = (blob) =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsText(blob);
  });

describe('DownloadLogModal', () => {
  it('zips the log and attachments by default', async () => {
    const onClose = renderModal();
    const box = /** @type {HTMLInputElement} */ (
      screen.getByLabelText(/Download file attachments/)
    );
    expect(box.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(
      /^signalk-maintenance-log-\d{4}-\d\d-\d\d\.zip$/,
    );
    const files = await readZip(downloads[0].blob);
    const names = [...files.keys()];
    const root = names[0].split('/')[0];
    expect(downloads[0].name).toBe(root + '.zip');
    const pdf = root + '/attachments/engine-oil_2026-01-02_log-7/receipt.pdf';
    expect(names).toEqual([root + '/log.csv', pdf]);
    expect([...files.get(pdf).data]).toEqual([1, 2, 3]);

    const csv = new TextDecoder().decode(files.get(root + '/log.csv').data);
    expect(csv.split('\r\n')[1]).toBe(
      'Engine oil,2026-01-02T00:00:00.000Z,10,zach,Oil,attachments/engine-oil_2026-01-02_log-7/receipt.pdf',
    );
  });

  it('downloads the bare log when attachments are unticked', async () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByLabelText(/Download file attachments/));
    fireEvent.click(screen.getByLabelText('JSON'));
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(downloads[0].name).toMatch(/\.json$/);
    const parsed = JSON.parse(String(await text(downloads[0].blob)));
    expect(parsed[0]).not.toHaveProperty('attachments');
  });

  it('reports a failed attachment fetch and stays open', async () => {
    entries[0].files[0].id = 71; // not served by the mock
    try {
      const onClose = renderModal();
      fireEvent.click(screen.getByRole('button', { name: /Download/ }));
      await screen.findByText(/Could not download "receipt.pdf" \(404\)/);
      expect(onClose).not.toHaveBeenCalled();
      expect(downloads).toHaveLength(0);
    } finally {
      entries[0].files[0].id = 70;
    }
  });
});
