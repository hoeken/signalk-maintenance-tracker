/**
 * Hours/cost figures: aggregating recorded values (mirrors aggregateOf in
 * src/domain/stats.ts) and reading the optional amount inputs.
 */

/** @typedef {import('../types.js').Aggregate} Aggregate */

/**
 * Sum and mean over the recorded values; null/undefined (not recorded) are
 * skipped, so `count` is how many there were.
 * @param {(number|null|undefined)[]} values
 * @returns {Aggregate}
 */
export function aggregateOf(values) {
  let total = 0;
  let count = 0;
  for (const v of values) {
    if (!isRecorded(v)) continue;
    total += v;
    count += 1;
  }
  return { total, count, average: count > 0 ? total / count : null };
}

/**
 * True when an optional hours/cost figure was recorded.
 * @param {number|null|undefined} value
 * @returns {value is number}
 */
export function isRecorded(value) {
  return value !== null && value !== undefined;
}

/**
 * An optional hours/cost input: blank = null (not recorded), otherwise a
 * non-negative number; undefined when the text isn't one.
 * @param {string} text
 * @returns {number|null|undefined}
 */
export function parseAmount(text) {
  if (text.trim() === '') return null;
  const n = Number(text);
  return isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Input text for a stored amount (blank when not recorded).
 * @param {number|null|undefined} value
 */
export function amountInput(value) {
  return value === null || value === undefined ? '' : String(value);
}
