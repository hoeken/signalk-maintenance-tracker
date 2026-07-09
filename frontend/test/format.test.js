import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatHours,
  formatRemainingHours,
  formatRemainingTime,
  humanizeMs,
  toDateInput,
  truncate,
} from '../../public/app/lib/format.js';

const DAY = 24 * 3600 * 1000;

describe('format helpers', () => {
  it('formats hours with null fallback', () => {
    expect(formatHours(1240.55)).toBe('1240.6 h');
    expect(formatHours(null)).toBe('—');
  });

  it('marks negative remaining runtime as overdue', () => {
    expect(formatRemainingHours(80.5)).toBe('80.5 h');
    expect(formatRemainingHours(-20)).toBe('20 h overdue');
  });

  it('humanizes millisecond spans', () => {
    expect(humanizeMs(3 * DAY)).toBe('3 days');
    expect(humanizeMs(5 * 3600 * 1000)).toBe('5 hours');
    expect(humanizeMs(60000)).toBe('< 1 hour');
  });

  it('marks negative remaining time as overdue', () => {
    expect(formatRemainingTime(-3 * DAY)).toBe('3 days overdue');
    expect(formatRemainingTime(null)).toBe('—');
  });

  it('formats dates from the stored UTC date part, never local time', () => {
    expect(formatDate('2026-07-08T00:00:00.000Z')).toBe('2026-07-08');
    expect(formatDate(null)).toBe('—');
  });

  it('date input values round-trip the stored UTC date part', () => {
    expect(toDateInput('2026-07-01T10:00:00.000Z')).toBe('2026-07-01');
    expect(toDateInput()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('truncates with ellipsis', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 10)).toBe('abc');
  });
});
