import {
  ComputedFields,
  Status,
  STATUS_RANK,
  TaskRow,
  TimeUnit,
} from '../types';

export interface StatusConfig {
  runtimeNotifyLeadHours: number;
  timeNotifyLeadDays: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Calendar-aware interval addition (UTC). Month/year arithmetic clamps to the
 * end of the target month (Jan 31 + 1 month = Feb 28/29), matching day.js
 * `.add` semantics used on the frontend.
 */
export function addInterval(iso: string, n: number, unit: TimeUnit): Date {
  const d = new Date(iso);
  switch (unit) {
    case 'days':
      d.setUTCDate(d.getUTCDate() + n);
      return d;
    case 'weeks':
      d.setUTCDate(d.getUTCDate() + 7 * n);
      return d;
    case 'months':
      return addMonths(d, n);
    case 'years':
      return addMonths(d, 12 * n);
  }
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  const daysInTarget = new Date(
    Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0),
  ).getUTCDate();
  r.setUTCDate(Math.min(day, daysInTarget));
  return r;
}

function mostUrgent(statuses: Status[]): Status {
  if (statuses.length === 0) return 'unknown';
  return statuses.reduce((a, b) => (STATUS_RANK[a] <= STATUS_RANK[b] ? a : b));
}

/**
 * Compute all derived fields for a task (§6.2/§6.3). Pure function: runtime
 * value and clock are injected.
 */
export function computeTask(
  task: Pick<
    TaskRow,
    | 'runtime_interval'
    | 'time_interval'
    | 'time_interval_unit'
    | 'runtime_path'
    | 'due_date'
    | 'last_maintenance'
    | 'last_runtime'
    | 'created_at'
  >,
  currentRuntime: number | null,
  now: Date,
  cfg: StatusConfig,
): ComputedFields {
  const out: ComputedFields = {
    current_runtime: currentRuntime,
    elapsed_runtime: null,
    remaining_runtime: null,
    due_runtime_at: null,
    runtime_fraction: null,
    runtime_status: null,
    scheduled_due_date: null,
    scheduled_remaining_ms: null,
    scheduled_fraction: null,
    scheduled_status: null,
    due_date_remaining_ms: null,
    due_date_fraction: null,
    due_date_status: null,
    remaining_time_ms: null,
    time_fraction: null,
    time_status: null,
    status: 'unknown',
    status_rank: STATUS_RANK.unknown,
    urgency: -Infinity,
  };

  // Runtime dimension: configured when both interval and path are set.
  if (task.runtime_interval != null && task.runtime_path != null) {
    if (task.last_runtime != null && currentRuntime != null) {
      const elapsed = currentRuntime - task.last_runtime;
      const remaining = task.runtime_interval - elapsed;
      out.elapsed_runtime = elapsed;
      out.remaining_runtime = remaining;
      out.due_runtime_at = task.last_runtime + task.runtime_interval;
      out.runtime_fraction = elapsed / task.runtime_interval;
      out.runtime_status =
        remaining <= 0
          ? 'overdue'
          : remaining <= cfg.runtimeNotifyLeadHours
            ? 'due_soon'
            : 'ok';
    } else {
      out.runtime_status = 'unknown';
    }
  }

  // Recurring time-interval dimension: configured when magnitude + unit are set.
  if (task.time_interval != null && task.time_interval_unit != null) {
    if (task.last_maintenance != null) {
      const last = new Date(task.last_maintenance).getTime();
      const due = addInterval(
        task.last_maintenance,
        task.time_interval,
        task.time_interval_unit,
      ).getTime();
      out.scheduled_due_date = new Date(due).toISOString();
      out.scheduled_remaining_ms = due - now.getTime();
      const span = due - last;
      out.scheduled_fraction = span > 0 ? (now.getTime() - last) / span : 1;
      out.scheduled_status = dateStatus(out.scheduled_remaining_ms, cfg);
    } else {
      out.scheduled_status = 'unknown';
    }
  }

  // One-time due-date dimension: the stored deadline. Fraction runs from task
  // creation to the deadline, so a freshly-set far-off deadline reads ~empty.
  if (task.due_date != null) {
    const due = new Date(task.due_date).getTime();
    out.due_date_remaining_ms = due - now.getTime();
    const start = new Date(task.created_at).getTime();
    const span = due - start;
    out.due_date_fraction = span > 0 ? (now.getTime() - start) / span : 1;
    out.due_date_status = dateStatus(out.due_date_remaining_ms, cfg);
  }

  // Merged "time" dimension = the more urgent of the two: whichever has the
  // lower remaining drives remaining_time_ms + time_fraction; time_status is
  // the most-urgent of the sub-statuses (so a configured-but-unknown recurring
  // dimension still surfaces as unknown).
  const timeSubs = [
    { remaining: out.scheduled_remaining_ms, fraction: out.scheduled_fraction },
    { remaining: out.due_date_remaining_ms, fraction: out.due_date_fraction },
  ].filter((d): d is { remaining: number; fraction: number | null } =>
    Number.isFinite(d.remaining as number),
  );
  if (timeSubs.length) {
    const driving = timeSubs.reduce((a, b) =>
      a.remaining <= b.remaining ? a : b,
    );
    out.remaining_time_ms = driving.remaining;
    out.time_fraction = driving.fraction;
  }
  out.time_status = mostUrgentOrNull([
    out.scheduled_status,
    out.due_date_status,
  ]);

  const dims = [out.runtime_status, out.time_status].filter(
    (s): s is Status => s != null,
  );
  out.status = mostUrgent(dims);
  out.status_rank = STATUS_RANK[out.status];
  const fractions = [out.runtime_fraction, out.time_fraction].filter(
    (f): f is number => f != null,
  );
  out.urgency = fractions.length ? Math.max(...fractions) : -Infinity;
  return out;
}

/** Date-based sub-status from remaining milliseconds (§6.3). */
function dateStatus(remainingMs: number, cfg: StatusConfig): Status {
  if (remainingMs <= 0) return 'overdue';
  if (remainingMs <= cfg.timeNotifyLeadDays * MS_PER_DAY) return 'due_soon';
  return 'ok';
}

/** mostUrgent over a nullable list, preserving null when no dimension is set. */
function mostUrgentOrNull(statuses: (Status | null)[]): Status | null {
  const present = statuses.filter((s): s is Status => s != null);
  return present.length ? mostUrgent(present) : null;
}
