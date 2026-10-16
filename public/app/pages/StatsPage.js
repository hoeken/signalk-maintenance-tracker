/**
 * Stats: hours and costs across the whole tracker — every task's estimates
 * against what every log entry actually recorded, overall and per task.
 */
import { html } from '../lib/html.js';
import { useStats } from '../api/hooks.js';
import { formatCost, formatWorkHours } from '../lib/format.js';
import { Table } from '../components/Table.js';
import { StatTable } from '../components/StatTable.js';

/** @typedef {import('../types.js').Aggregate} Aggregate */
/** @typedef {import('../types.js').TaskStatsDTO} TaskStatsDTO */

/**
 * A per-task table row; the standalone-entries line has no slug.
 * @typedef {Omit<TaskStatsDTO, 'slug'> & { slug: string|null }} StatsRow
 */

/** @param {any} text */
const muted = (text) => html`<span class="muted">${text}</span>`;

/**
 * @param {number|null} value
 * @param {(n: number) => string} format
 */
const cell = (value, format) => (value !== null ? format(value) : muted('—'));

/** @param {number} n */
const entries = (n) => (n === 1 ? '1 entry' : n + ' entries');

/** @param {number} n */
const tasks = (n) => (n === 1 ? '1 task' : n + ' tasks');

export function StatsPage() {
  const statsRes = useStats();
  const stats = statsRes.data;

  if (statsRes.error && !stats) {
    return html`<div class="error-box">
      Failed to load stats: ${statsRes.error.message}
    </div>`;
  }
  if (!stats) return html`<div class="table-loading">Loading…</div>`;

  const hasTime =
    stats.estimated.hours.count > 0 || stats.actual.hours.count > 0;
  const hasCost = stats.estimated.cost.count > 0 || stats.actual.cost.count > 0;

  /**
   * Overall estimated vs actual figures for one dimension.
   * @param {Aggregate} estimated
   * @param {Aggregate} actual
   * @param {(n: number) => string} format
   */
  const overallRows = (estimated, actual, format) => [
    {
      label: 'Estimated total',
      value: estimated.count
        ? html`${format(estimated.total)}${' '}<span class="muted stat-note"
              >(${tasks(estimated.count)})</span
            >`
        : null,
    },
    {
      label: 'Average estimate',
      value: estimated.average !== null ? format(estimated.average) : null,
    },
    {
      label: 'Actual total',
      value: actual.count
        ? html`${format(actual.total)}${' '}<span class="muted stat-note"
              >(${entries(actual.count)})</span
            >`
        : null,
    },
    {
      label: 'Average actual',
      value: actual.average !== null ? format(actual.average) : null,
    },
  ];

  /** @type {StatsRow[]} */
  const rows = stats.tasks.slice();
  const standalone = stats.standalone;
  if (standalone.actual.hours.count || standalone.actual.cost.count) {
    rows.push({
      slug: null,
      name: 'Standalone entries',
      is_archived: false,
      is_recurring: false,
      estimated_hours: null,
      estimated_cost: null,
      log_count: standalone.log_count,
      actual: standalone.actual,
    });
  }

  /** @type {import('../components/Table.js').Column[]} */
  const columns = [
    {
      key: 'name',
      label: 'Task',
      className: 'col-truncate',
      render: (/** @type {StatsRow} */ r) =>
        r.slug !== null
          ? html`<a href=${'#/tasks/' + encodeURIComponent(r.slug)} title=${r.name}
              >${r.name}</a
            >${r.is_archived ? html` ${muted('(archived)')}` : null}`
          : muted(r.name),
    },
    {
      key: 'estimated_hours',
      label: 'Est. time',
      className: 'num hide-sm',
      render: (/** @type {StatsRow} */ r) =>
        cell(r.estimated_hours, formatWorkHours),
    },
    {
      key: 'actual_hours',
      label: 'Total time',
      className: 'num',
      render: (/** @type {StatsRow} */ r) =>
        cell(
          r.actual.hours.count ? r.actual.hours.total : null,
          formatWorkHours,
        ),
    },
    {
      key: 'average_hours',
      label: 'Avg time',
      className: 'num hide-sm',
      render: (/** @type {StatsRow} */ r) =>
        cell(r.actual.hours.average, formatWorkHours),
    },
    {
      key: 'estimated_cost',
      label: 'Est. cost',
      className: 'num hide-sm',
      render: (/** @type {StatsRow} */ r) => cell(r.estimated_cost, formatCost),
    },
    {
      key: 'actual_cost',
      label: 'Total cost',
      className: 'num',
      render: (/** @type {StatsRow} */ r) =>
        cell(r.actual.cost.count ? r.actual.cost.total : null, formatCost),
    },
    {
      key: 'average_cost',
      label: 'Avg cost',
      className: 'num hide-sm',
      render: (/** @type {StatsRow} */ r) =>
        cell(r.actual.cost.average, formatCost),
    },
    {
      key: 'log_count',
      label: 'Entries',
      className: 'num hide-sm',
      render: (/** @type {StatsRow} */ r) => String(r.log_count),
    },
  ];

  return html`
    <div>
      <div class="page-header">
        <h1 class="page-title">Stats</h1>
      </div>

      ${
        !hasTime && !hasCost
          ? html`<p class="muted">
              No hours or costs recorded yet. Add estimates when editing a
              task, or record the actual time and cost when marking it
              complete.
            </p>`
          : html`
              <div class="detail-grid">
                ${
                  hasTime
                    ? html`<div class="card">
                        <h3>Time</h3>
                        <${StatTable}
                          rows=${overallRows(stats.estimated.hours, stats.actual.hours, formatWorkHours)}
                        />
                      </div>`
                    : null
                }
                ${
                  hasCost
                    ? html`<div class="card">
                        <h3>Costs</h3>
                        <${StatTable}
                          rows=${overallRows(stats.estimated.cost, stats.actual.cost, formatCost)}
                        />
                      </div>`
                    : null
                }
              </div>

              <div class="page-header" style="margin-top:24px">
                <h2 class="page-title" style="font-size:17px">By task</h2>
              </div>
              <${Table}
                columns=${columns}
                rows=${rows}
                rowKey=${(/** @type {StatsRow} */ r) => r.slug ?? ''}
              />
            `
      }
    </div>
  `;
}
