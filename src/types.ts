export type TimeUnit = 'days' | 'weeks' | 'months' | 'years';

export const TIME_UNITS: TimeUnit[] = ['days', 'weeks', 'months', 'years'];

/**
 * `todo` is an open non-recurring item (outranks `ok`: todos are actionable);
 * `pending` is a recurring task whose schedule can't be computed yet (interval
 * configured but no runtime reading / no maintenance ever logged).
 */
export type Status =
  'overdue' | 'due_soon' | 'todo' | 'ok' | 'pending' | 'archived';

export const STATUS_RANK: Record<Status, number> = {
  overdue: 0,
  due_soon: 1,
  todo: 2,
  ok: 3,
  pending: 4,
  archived: 5,
};

export interface TaskRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  runtime_interval: number | null;
  time_interval: number | null;
  time_interval_unit: TimeUnit | null;
  runtime_path: string | null;
  due_date: string | null;
  /** Per-task "due soon" lead window overriding runtimeNotifyLeadHours;
   * null = use the plugin default, 0 = no warning window. */
  runtime_warning_hours: number | null;
  /** Per-task "due soon" lead window (days) overriding timeNotifyLeadDays for
   * both time sub-dimensions; null = use the plugin default, 0 = no window. */
  time_warning_days: number | null;
  last_maintenance: string | null;
  last_runtime: number | null;
  seed_last_maintenance: string | null;
  seed_last_runtime: number | null;
  /** SQLite boolean (0/1). An archived task's status is always 'archived',
   * which outranks every computed status — it never shows up in the other
   * status lists and never raises a notification. */
  is_archived: number;
  /** SQLite boolean (0/1). 0 = a one-off "todo" item: no intervals or runtime
   * path (service-enforced), optional due date, archived when completed. */
  is_recurring: number;
  /** Expected labour per completion, decimal hours; null = no estimate. */
  estimated_hours: number | null;
  /** Expected cost per completion, unitless decimal; null = no estimate. */
  estimated_cost: number | null;
  created_at: string;
  updated_at: string;
}

export interface LogRow {
  id: number;
  /** null on standalone (non-task) entries, which carry `title` instead —
   * exactly one of the two is set (CHECK constraint, migration 6). */
  task_id: number | null;
  /** Display name of a standalone entry; null on task-linked entries. */
  title: string | null;
  maintenance_date: string;
  runtime_hours: number | null;
  notes: string | null;
  logged_by: string | null;
  /** Labour the work actually took, decimal hours; null = not recorded. */
  actual_hours: number | null;
  /** What the work actually cost, unitless decimal; null = not recorded. */
  actual_cost: number | null;
  created_at: string;
  /** Last edit that changed the entry; null if never edited. */
  updated_at: string | null;
}

/** A log entry as the API returns it: the row plus its attachments. */
export interface LogEntryDTO extends LogRow {
  /** Attachments (photos of the work, receipts) — uploaded and deleted
   * through the /logs/:id/files endpoints, never through the entry body. */
  files: FileDTO[];
}

export interface LogDTO extends LogEntryDTO {
  /** null on standalone entries — the UI shows `title` instead. */
  task_slug: string | null;
  task_name: string | null;
}

export interface ComputedFields {
  current_runtime: number | null;
  /** `current_runtime - last_runtime`. Known whenever both readings exist,
   * independent of any configured interval — an interval-less task still wants
   * to show how many hours it has run since it was last serviced. */
  elapsed_runtime: number | null;
  remaining_runtime: number | null;
  due_runtime_at: number | null;
  runtime_fraction: number | null;
  runtime_status: Status | null;

  /** Wall-clock ms since `last_maintenance`. The time-side counterpart to
   * `elapsed_runtime`, and likewise interval-independent. */
  elapsed_time_ms: number | null;

  // Recurring time-interval dimension (last_maintenance + interval).
  scheduled_due_date: string | null;
  scheduled_remaining_ms: number | null;
  scheduled_fraction: number | null;
  scheduled_status: Status | null;

  // One-time due-date dimension (the stored due_date deadline).
  due_date_remaining_ms: number | null;
  due_date_fraction: number | null;
  due_date_status: Status | null;

  // Merged "time" dimension: the more urgent (lower remaining) of the
  // recurring interval and the one-time due date. These are what the task
  // list, sort, and notifications consume; the detail page breaks the two
  // sub-dimensions back out.
  remaining_time_ms: number | null;
  time_fraction: number | null;
  time_status: Status | null;

  status: Status;
  status_rank: number;
  /** secondary sort key: highest known fraction (more elapsed = more urgent) */
  urgency: number;
}

export interface TaskConsumableDTO {
  item_id: string;
  item_name: string;
  qty_per_service: number;
}

/** An attachment record, whether on a task or a log entry. */
export interface FileDTO {
  id: number;
  name: string;
  /** bytes */
  size: number;
  mime: string | null;
  created_at: string;
}

export interface TaskDTO extends ComputedFields {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  tags: string[];
  runtime_interval: number | null;
  time_interval: number | null;
  time_interval_unit: TimeUnit | null;
  runtime_path: string | null;
  due_date: string | null;
  runtime_warning_hours: number | null;
  time_warning_days: number | null;
  last_maintenance: string | null;
  last_runtime: number | null;
  is_archived: boolean;
  is_recurring: boolean;
  estimated_hours: number | null;
  estimated_cost: number | null;
  created_at: string;
  updated_at: string;
  /** Items in signalk-stowage-mgmt this task consumes on completion — see
   * docs/inventory-interaction.md. Empty when the integration isn't
   * configured (stowageMgmtUrl unset) or none are linked. */
  consumables: TaskConsumableDTO[];
  /** Attachments (manuals, receipts, photos) — uploaded and deleted through
   * the /tasks/:slug/files endpoints, never through the task body. */
  files: FileDTO[];
}

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Sum and mean over the values that were actually recorded — `count` is
 * how many there were, and `average` is null when there were none. */
export interface Aggregate {
  total: number;
  count: number;
  average: number | null;
}

export interface WorkStats {
  hours: Aggregate;
  cost: Aggregate;
}

/** The task list's page, plus figures over every task matching the filters
 * (not just this page): the tasks' estimates, and what their log entries
 * actually recorded. */
export interface TaskPage extends Page<TaskDTO> {
  stats: { estimated: WorkStats; actual: WorkStats };
}

/** The master log's page, plus actual figures over every matching entry. */
export interface LogPage extends Page<LogDTO> {
  stats: WorkStats;
}

/** One task's line on the stats page. */
export interface TaskStatsDTO {
  slug: string;
  name: string;
  is_archived: boolean;
  is_recurring: boolean;
  estimated_hours: number | null;
  estimated_cost: number | null;
  /** All of the task's log entries, recorded figures or not. */
  log_count: number;
  actual: WorkStats;
}

/** GET /stats: estimates across all tasks, actuals across all log entries. */
export interface StatsDTO {
  estimated: WorkStats;
  actual: WorkStats;
  /** Every task with an estimate or any recorded actuals. */
  tasks: TaskStatsDTO[];
  /** Standalone (non-task) entries: how many, and their recorded actuals. */
  standalone: { log_count: number; actual: WorkStats };
}

export interface TaskInput {
  name?: string;
  slug?: string;
  description?: string | null;
  runtime_interval?: number | null;
  time_interval?: number | null;
  time_interval_unit?: TimeUnit | null;
  runtime_path?: string | null;
  due_date?: string | null;
  /** null clears the override (fall back to the plugin default); 0 disables
   * the runtime "due soon" window entirely. */
  runtime_warning_hours?: number | null;
  /** null clears the override (fall back to the plugin default); 0 disables
   * the time "due soon" window entirely. */
  time_warning_days?: number | null;
  tags?: string[];
  last_maintenance?: string | null;
  last_runtime?: number | null;
  /** Archived tasks read as status 'archived' and drop out of every other
   * status list; toggled from the task detail page. */
  is_archived?: boolean;
  /** false = one-off todo item. Omitted on create = inferred from whether an
   * interval is present (keeps pre-v1.5 API calls working). Setting false
   * clears any schedule; recurring tasks must keep at least one interval. */
  is_recurring?: boolean;
  /** null clears the estimate. */
  estimated_hours?: number | null;
  /** null clears the estimate. */
  estimated_cost?: number | null;
  /** Wholesale-replaces the task's linked consumables when present, same
   * semantics as `tags` (docs/inventory-interaction.md). */
  consumables?: TaskConsumableDTO[];
}

export interface LogInput {
  maintenance_date?: string;
  runtime_hours?: number | null;
  notes?: string | null;
  actual_hours?: number | null;
  actual_cost?: number | null;
  /** Standalone (non-task) entries only: their display name. Required on
   * create; ignored on task-linked entries. */
  title?: string | null;
  /** Opt-in per completion, defaults to true when the task has linked
   * consumables — set false to log the work without touching stowage-mgmt
   * stock (docs/inventory-interaction.md). */
  consume_stock?: boolean;
  /** Person-chosen location allocation for any linked consumable that's
   * split across locations in stowage-mgmt — omitted/missing for an item
   * means it's treated as non-split (a plain quantity decrement), which
   * will itself fail with a warning if the item turns out to be split. */
  consumable_allocations?: {
    item_id: string;
    placements: { placement_id: string; quantity: number }[];
  }[];
  /** Person-chosen subset of the task's linked consumables to draw down,
   * each with the quantity actually used. When present, only the listed
   * items are consumed (linked items left out are skipped, unlinked ids are
   * ignored); when omitted, every linked item is consumed at its
   * qty_per_service. */
  consumable_quantities?: { item_id: string; quantity: number }[];
}
