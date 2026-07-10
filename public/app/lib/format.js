/**
 * Display formatting helpers. All date math beyond formatting happens on the
 * backend (§6.2); day.js here is for parsing/formatting only.
 */
import dayjs from '../../vendor/dayjs/index.js';

const MS_PER_HOUR = 3600 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Calendar-date display. Uses the stored UTC date part directly — parsing to
 * local time would shift UTC-midnight dates back a day in western timezones.
 * @param {string|null|undefined} iso
 */
export function formatDate(iso) {
  return iso ? String(iso).slice(0, 10) : '—';
}

/**
 * Runtime hours for display: "1240.5 h". Null-safe.
 * @param {number|null|undefined} hours
 */
export function formatHours(hours) {
  if (hours === null || hours === undefined) return '—';
  const rounded = Math.round(hours * 10) / 10;
  return String(rounded) + ' h';
}

/**
 * Remaining runtime column: negative = overdue.
 * @param {number|null|undefined} hours
 */
export function formatRemainingHours(hours) {
  if (hours === null || hours === undefined) return '—';
  if (hours < 0) return formatHours(-hours) + ' overdue';
  return formatHours(hours);
}

/**
 * Humanize a millisecond span: "3 days", "5 hours", "< 1 hour".
 * @param {number} ms non-negative
 */
export function humanizeMs(ms) {
  if (ms >= MS_PER_DAY) {
    const days = Math.round(ms / MS_PER_DAY);
    return days + (days === 1 ? ' day' : ' days');
  }
  if (ms >= MS_PER_HOUR) {
    const hours = Math.round(ms / MS_PER_HOUR);
    return hours + (hours === 1 ? ' hour' : ' hours');
  }
  return '< 1 hour';
}

/**
 * Remaining time column: negative = overdue.
 * @param {number|null|undefined} ms
 */
export function formatRemainingTime(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 0) return humanizeMs(-ms) + ' overdue';
  return humanizeMs(ms);
}

/**
 * Value for <input type="date">: today (local) by default, or the UTC date
 * part of a stored ISO string. The YYYY-MM-DD value is sent to the API as-is
 * (valid ISO-8601; the backend normalizes it to UTC midnight).
 * @param {string} [iso]
 */
export function toDateInput(iso) {
  return iso === undefined
    ? dayjs().format('YYYY-MM-DD')
    : String(iso).slice(0, 10);
}

/**
 * @param {string|null|undefined} s
 * @param {number} max
 */
export function truncate(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * SignalK stamps device-token principals with a raw UUID identifier
 * (e.g. "158dccd5-f82c-42a3-9909-42ac7d3c8e88") rather than a human name.
 */
const TOKEN_USER_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when a "logged by" name is a SignalK device-token UUID rather than a
 * human username.
 * @param {string|null|undefined} name
 */
export function isTokenUser(name) {
  return typeof name === 'string' && TOKEN_USER_RE.test(name.trim());
}

/**
 * Display form for a "logged by" name: human usernames pass through unchanged,
 * but token UUIDs collapse to their first segment ("158dccd5") so the table
 * stays readable. Pair with the full value in a title tooltip at the call site.
 * @param {string|null|undefined} name
 */
export function formatUser(name) {
  if (!name) return '';
  const trimmed = String(name).trim();
  return isTokenUser(trimmed) ? trimmed.slice(0, 8) : trimmed;
}

/** Status → human label. @param {string} status */
export function statusLabel(status) {
  if (status === 'due_soon') return 'due soon';
  return status;
}
