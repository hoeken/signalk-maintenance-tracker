export type TimeUnit = 'days' | 'weeks' | 'months' | 'years';

export const TIME_UNITS: TimeUnit[] = ['days', 'weeks', 'months', 'years'];

export type Status = 'overdue' | 'due_soon' | 'ok' | 'unknown';

export const STATUS_RANK: Record<Status, number> = {
  overdue: 0,
  due_soon: 1,
  ok: 2,
  unknown: 3,
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
  created_at: string;
  updated_at: string;
}

export interface LogRow {
  id: number;
  task_id: number;
  maintenance_date: string;
  runtime_hours: number | null;
  notes: string | null;
  logged_by: string | null;
  created_at: string;
}

export interface LogDTO extends LogRow {
  task_slug: string;
  task_name: string;
}

export interface ComputedFields {
  current_runtime: number | null;
  elapsed_runtime: number | null;
  remaining_runtime: number | null;
  due_runtime_at: number | null;
  runtime_fraction: number | null;
  runtime_status: Status | null;

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
  created_at: string;
  updated_at: string;
  /** Items in signalk-stowage-mgmt this task consumes on completion — see
   * docs/inventory-interaction.md. Empty when the integration isn't
   * configured (stowageMgmtUrl unset) or none are linked. */
  consumables: TaskConsumableDTO[];
}

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
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
  /** Wholesale-replaces the task's linked consumables when present, same
   * semantics as `tags` (docs/inventory-interaction.md). */
  consumables?: TaskConsumableDTO[];
}

export interface LogInput {
  maintenance_date?: string;
  runtime_hours?: number | null;
  notes?: string | null;
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
}
