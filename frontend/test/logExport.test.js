import { describe, it, expect } from 'vitest';
import {
  buildCsv,
  buildMarkdown,
  buildJson,
  buildLogExport,
  dateStamp,
  attachmentPaths,
  safeFileName,
} from '../../public/app/lib/logExport.js';

/** @type {import('../../public/app/types.js').LogDTO[]} */
const entries = [
  {
    id: 1,
    task_id: 1,
    title: null,
    maintenance_date: '2026-01-02',
    runtime_hours: 12.5,
    notes: 'Changed oil, filter',
    logged_by: 'zach',
    actual_hours: 0.75,
    actual_cost: 42.5,
    created_at: '2026-01-02T00:00:00Z',
    task_slug: 'engine-oil',
    task_name: 'Engine oil',
  },
  {
    id: 2,
    task_id: 1,
    title: null,
    maintenance_date: '2026-02-03',
    runtime_hours: null,
    notes: 'Line one\nLine | two',
    logged_by: null,
    created_at: '2026-02-03T00:00:00Z',
    task_slug: 'engine-oil',
    task_name: 'Engine oil',
  },
  // standalone (non-task) entry: title stands in for the task name
  {
    id: 3,
    task_id: null,
    title: 'Haul out',
    maintenance_date: '2026-03-04',
    runtime_hours: null,
    notes: null,
    logged_by: 'zach',
    created_at: '2026-03-04T00:00:00Z',
    task_slug: null,
    task_name: null,
  },
];

describe('log export', () => {
  it('builds CSV with header row and quotes fields containing commas', () => {
    const csv = buildCsv(entries);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'Task,Date,Runtime Hours,Actual Hours,Actual Cost,Logged By,Notes',
    );
    expect(lines[1]).toBe(
      'Engine oil,2026-01-02,12.5,0.75,42.5,zach,"Changed oil, filter"',
    );
    // null runtime/logged_by render as empty; newline forces quoting.
    expect(lines[2]).toBe('Engine oil,2026-02-03,,,,,"Line one\nLine | two"');
    // standalone entry: its title fills the Task column
    expect(lines[3]).toBe('Haul out,2026-03-04,,,,zach,');
  });

  it('builds a Markdown table, escaping pipes and newlines', () => {
    const md = buildMarkdown(entries);
    expect(md).toContain('# SignalK Maintenance Log');
    expect(md).toContain(
      '| Task | Date | Runtime Hours | Actual Hours | Actual Cost | Logged By | Notes |',
    );
    expect(md).toContain(
      '| Engine oil | 2026-01-02 | 12.5 | 0.75 | 42.5 | zach | Changed oil, filter |',
    );
    expect(md).toContain('Line one<br>Line \\| two');
  });

  it('builds JSON as a curated array of records', () => {
    const parsed = JSON.parse(buildJson(entries));
    expect(parsed).toEqual([
      {
        task: 'Engine oil',
        task_slug: 'engine-oil',
        maintenance_date: '2026-01-02',
        runtime_hours: 12.5,
        actual_hours: 0.75,
        actual_cost: 42.5,
        logged_by: 'zach',
        notes: 'Changed oil, filter',
      },
      {
        task: 'Engine oil',
        task_slug: 'engine-oil',
        maintenance_date: '2026-02-03',
        runtime_hours: null,
        logged_by: null,
        notes: 'Line one\nLine | two',
      },
      {
        task: 'Haul out',
        task_slug: null,
        maintenance_date: '2026-03-04',
        runtime_hours: null,
        logged_by: 'zach',
        notes: null,
      },
    ]);
  });

  it('dispatches on format, defaulting to CSV for unknown values', () => {
    expect(buildLogExport(entries, 'markdown')).toBe(buildMarkdown(entries));
    expect(buildLogExport(entries, 'json')).toBe(buildJson(entries));
    expect(buildLogExport(entries, 'csv')).toBe(buildCsv(entries));
    expect(buildLogExport(entries, 'bogus')).toBe(buildCsv(entries));
  });

  it('formats a zero-padded local date stamp', () => {
    expect(dateStamp(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dateStamp(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  describe('with attachments', () => {
    const file = (id, name) => ({
      id,
      name,
      size: 1,
      mime: null,
      created_at: '2026-01-02T00:00:00Z',
    });
    /** @type {import('../../public/app/types.js').LogDTO[]} */
    const withFiles = [
      {
        ...entries[0],
        files: [file(10, 'receipt.pdf'), file(11, 'photo.jpg')],
      },
      { ...entries[1], files: [] },
      {
        ...entries[2],
        maintenance_date: '2026-03-04T00:00:00.000Z', // as the API sends it
        files: [file(12, 'a.txt'), file(13, 'A.txt'), file(14, 'a.txt')],
      },
    ];
    const paths = attachmentPaths(withFiles);

    it('puts each entry in its own folder keyed by date and log id', () => {
      expect(paths.get(1)).toEqual([
        'attachments/engine-oil_2026-01-02_log-1/receipt.pdf',
        'attachments/engine-oil_2026-01-02_log-1/photo.jpg',
      ]);
      expect(paths.has(2)).toBe(false);
      // case-insensitive collisions get numbered
      expect(paths.get(3)).toEqual([
        'attachments/haul-out_2026-03-04_log-3/a.txt',
        'attachments/haul-out_2026-03-04_log-3/A (2).txt',
        'attachments/haul-out_2026-03-04_log-3/a (3).txt',
      ]);
    });

    it('sanitizes names into a single safe path segment', () => {
      expect(safeFileName('../../etc/passwd')).toBe('.._.._etc_passwd');
      expect(safeFileName('a:b*c?.txt')).toBe('a_b_c_.txt');
      expect(safeFileName('trailing. ')).toBe('trailing');
      expect(safeFileName('..')).toBe('file');
      expect(safeFileName('')).toBe('file');
    });

    it('adds an Attachments column to CSV listing zip paths', () => {
      const lines = buildCsv(withFiles, paths).split('\r\n');
      expect(lines[0]).toBe(
        'Task,Date,Runtime Hours,Actual Hours,Actual Cost,Logged By,Notes,Attachments',
      );
      expect(lines[1]).toBe(
        'Engine oil,2026-01-02,12.5,0.75,42.5,zach,"Changed oil, filter",' +
          '"attachments/engine-oil_2026-01-02_log-1/receipt.pdf\n' +
          'attachments/engine-oil_2026-01-02_log-1/photo.jpg"',
      );
    });

    it('links attachments from the Markdown table', () => {
      const md = buildMarkdown(withFiles, paths);
      expect(md).toContain('| Notes | Attachments |');
      expect(md).toContain(
        '[receipt.pdf](<attachments/engine-oil_2026-01-02_log-1/receipt.pdf>)<br>' +
          '[photo.jpg](<attachments/engine-oil_2026-01-02_log-1/photo.jpg>)',
      );
    });

    it('adds an attachments array to JSON records', () => {
      const parsed = JSON.parse(buildLogExport(withFiles, 'json', paths));
      expect(parsed[0].attachments).toEqual(paths.get(1));
      expect(parsed[1].attachments).toEqual([]);
    });
  });
});
