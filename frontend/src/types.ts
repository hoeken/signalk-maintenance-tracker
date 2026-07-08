// Shared DTO types — kept in sync with the backend (src/types.ts)

export type TimeUnit = 'days' | 'weeks' | 'months' | 'years';

export const TIME_UNITS: TimeUnit[] = ['days', 'weeks', 'months', 'years'];

export type Status = 'overdue' | 'due_soon' | 'ok' | 'unknown';

export interface TaskDTO {
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
  current_runtime: number | null;
  elapsed_runtime: number | null;
  remaining_runtime: number | null;
  due_runtime_at: number | null;
  runtime_fraction: number | null;
  due_date: string | null;
  remaining_time_ms: number | null;
  time_fraction: number | null;
  runtime_status: Status | null;
  time_status: Status | null;
  status: Status;
  status_rank: number;
  urgency: number;
}

export interface LogEntry {
  id: number;
  task_id: number;
  maintenance_date: string;
  runtime_hours: number | null;
  notes: string | null;
  logged_by: string | null;
  created_at: string;
}

export interface MasterLogEntry extends LogEntry {
  task_slug: string;
  task_name: string;
}

export interface TagCount {
  id: number;
  name: string;
  count: number;
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

export interface TaskListParams {
  search?: string;
  tags?: string[];
  status?: Status[];
  sort?: 'name' | 'remaining_runtime' | 'remaining_time' | 'status';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface MasterLogParams {
  search?: string;
  sort?: 'maintenance_date' | 'task' | 'runtime_hours';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
