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
  due_date: string | null;
  remaining_time_ms: number | null;
  time_fraction: number | null;
  /** sub-status per dimension; null = dimension not configured */
  runtime_status: Status | null;
  time_status: Status | null;
  status: Status;
  status_rank: number;
  /** secondary sort key: highest known fraction (more elapsed = more urgent) */
  urgency: number;
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
  last_maintenance: string | null;
  last_runtime: number | null;
  created_at: string;
  updated_at: string;
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
  tags?: string[];
  last_maintenance?: string | null;
  last_runtime?: number | null;
}

export interface LogInput {
  maintenance_date?: string;
  runtime_hours?: number | null;
  notes?: string | null;
}
