import { describe, it, expect } from 'vitest';
import {
  buildCsv,
  buildMarkdown,
  buildJson,
  buildLogExport,
  dateStamp,
} from '../../public/app/lib/logExport.js';

/** @type {import('../../public/app/types.js').LogDTO[]} */
const entries = [
  {
    id: 1,
    task_id: 1,
    maintenance_date: '2026-01-02',
    runtime_hours: 12.5,
    notes: 'Changed oil, filter',
    logged_by: 'zach',
    created_at: '2026-01-02T00:00:00Z',
    task_slug: 'engine-oil',
    task_name: 'Engine oil',
  },
  {
    id: 2,
    task_id: 1,
    maintenance_date: '2026-02-03',
    runtime_hours: null,
    notes: 'Line one\nLine | two',
    logged_by: null,
    created_at: '2026-02-03T00:00:00Z',
    task_slug: 'engine-oil',
    task_name: 'Engine oil',
  },
];

describe('log export', () => {
  it('builds CSV with header row and quotes fields containing commas', () => {
    const csv = buildCsv(entries);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Task,Date,Runtime Hours,Logged By,Notes');
    expect(lines[1]).toBe(
      'Engine oil,2026-01-02,12.5,zach,"Changed oil, filter"',
    );
    // null runtime/logged_by render as empty; newline forces quoting.
    expect(lines[2]).toBe('Engine oil,2026-02-03,,,"Line one\nLine | two"');
  });

  it('builds a Markdown table, escaping pipes and newlines', () => {
    const md = buildMarkdown(entries);
    expect(md).toContain('# SignalK Maintenance Log');
    expect(md).toContain('| Task | Date | Runtime Hours | Logged By | Notes |');
    expect(md).toContain(
      '| Engine oil | 2026-01-02 | 12.5 | zach | Changed oil, filter |',
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
});
