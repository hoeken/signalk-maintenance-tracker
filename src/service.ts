import type { DatabaseSync } from 'node:sqlite';
import { LogsRepo, MasterLogQuery } from './db/logs.repo';
import { TagsRepo, TagCount } from './db/tags.repo';
import { TasksRepo, NewTask } from './db/tasks.repo';
import { slugify, uniqueSlug } from './domain/slug';
import { computeTask, StatusConfig } from './domain/status';
import {
  LogDTO,
  LogInput,
  LogRow,
  Page,
  Status,
  TaskDTO,
  TaskInput,
  TaskRow,
  TIME_UNITS,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface TaskListQuery {
  search?: string;
  tags?: string[];
  status?: Status[];
  sort?: 'name' | 'remaining_runtime' | 'remaining_time' | 'status';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface MutationEvent {
  /** slug whose notification must be cleared (task deleted or slug renamed) */
  clearedSlug?: string;
}

export interface ServiceDeps {
  getRuntime: (path: string) => number | null;
  config: StatusConfig;
  /** invoked after any successful mutation so the plugin can rebuild
   * subscriptions and refresh notifications */
  onMutation?: (event: MutationEvent) => void;
  now?: () => Date;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export class MaintenanceService {
  readonly tasks: TasksRepo;
  readonly logs: LogsRepo;
  readonly tags: TagsRepo;

  constructor(
    private db: DatabaseSync,
    private deps: ServiceDeps,
  ) {
    this.tasks = new TasksRepo(db);
    this.logs = new LogsRepo(db);
    this.tags = new TagsRepo(db);
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private emit(event: MutationEvent = {}): void {
    this.deps.onMutation?.(event);
  }

  // ---- DTO assembly ----

  private toDTO(row: TaskRow, tags: string[]): TaskDTO {
    const current = row.runtime_path
      ? this.deps.getRuntime(row.runtime_path)
      : null;
    const computed = computeTask(row, current, this.now(), this.deps.config);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      tags,
      runtime_interval: row.runtime_interval,
      time_interval: row.time_interval,
      time_interval_unit: row.time_interval_unit,
      runtime_path: row.runtime_path,
      last_maintenance: row.last_maintenance,
      last_runtime: row.last_runtime,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ...computed,
    };
  }

  // ---- tasks ----

  listTasks(q: TaskListQuery): Page<TaskDTO> {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, q.pageSize ?? DEFAULT_PAGE_SIZE),
    );

    const tagsByTask = this.tags.tagsByTask();
    let items = this.tasks
      .listAll()
      .map((row) => this.toDTO(row, tagsByTask.get(row.id) ?? []));

    if (q.search) {
      const needle = q.search.toLowerCase();
      const noteMatches = this.logs.taskIdsWithNotesLike(`%${q.search}%`);
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(needle) ||
          (t.description ?? '').toLowerCase().includes(needle) ||
          t.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
          noteMatches.has(t.id),
      );
    }

    if (q.tags && q.tags.length) {
      const wanted = q.tags.map((t) => t.toLowerCase());
      items = items.filter((t) => {
        const have = t.tags.map((x) => x.toLowerCase());
        return wanted.every((w) => have.includes(w));
      });
    }

    if (q.status && q.status.length) {
      const set = new Set(q.status);
      items = items.filter((t) => set.has(t.status));
    }

    const dir = q.order === 'desc' ? -1 : 1;
    const byName = (a: TaskDTO, b: TaskDTO) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    // nulls always sort last regardless of direction
    const byNullable = (a: number | null, b: number | null) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return dir * (a - b);
    };

    switch (q.sort) {
      case 'name':
        items.sort((a, b) => dir * byName(a, b));
        break;
      case 'remaining_runtime':
        items.sort(
          (a, b) =>
            byNullable(a.remaining_runtime, b.remaining_runtime) ||
            byName(a, b),
        );
        break;
      case 'remaining_time':
        items.sort(
          (a, b) =>
            byNullable(a.remaining_time_ms, b.remaining_time_ms) ||
            byName(a, b),
        );
        break;
      case 'status':
      default:
        // default sort: most urgent first — status rank, then highest fraction
        items.sort(
          (a, b) =>
            dir * (a.status_rank - b.status_rank || b.urgency - a.urgency) ||
            byName(a, b),
        );
        break;
    }

    const total = items.length;
    const data = items.slice((page - 1) * pageSize, page * pageSize);
    return { data, total, page, pageSize };
  }

  listAllComputed(): TaskDTO[] {
    const tagsByTask = this.tags.tagsByTask();
    return this.tasks
      .listAll()
      .map((row) => this.toDTO(row, tagsByTask.get(row.id) ?? []));
  }

  getTask(slug: string): TaskDTO {
    const row = this.requireTask(slug);
    return this.toDTO(row, this.tags.tagsForTask(row.id));
  }

  createTask(body: TaskInput): TaskDTO {
    const name = (body.name ?? '').trim();
    if (!name) throw new ApiError(400, 'invalid_name', 'Task name is required');
    this.validateIntervals(
      body.runtime_interval,
      body.time_interval,
      body.time_interval_unit,
    );

    let slug: string;
    if (body.slug != null && body.slug.trim() !== '') {
      slug = slugify(body.slug);
      if (this.tasks.slugExists(slug))
        throw new ApiError(
          409,
          'slug_conflict',
          `Slug "${slug}" is already in use`,
        );
    } else {
      slug = uniqueSlug(slugify(name), (s) => this.tasks.slugExists(s));
    }

    const nowIso = this.now().toISOString();
    const seed: NewTask = {
      slug,
      name,
      description: body.description ?? null,
      runtime_interval: body.runtime_interval ?? null,
      time_interval: body.time_interval ?? null,
      time_interval_unit: body.time_interval_unit ?? null,
      runtime_path: body.runtime_path?.trim() || null,
      last_maintenance: body.last_maintenance ?? null,
      last_runtime: body.last_runtime ?? null,
      seed_last_maintenance: body.last_maintenance ?? null,
      seed_last_runtime: body.last_runtime ?? null,
    };
    const row = this.tasks.create(seed, nowIso);
    if (body.tags) this.tags.setTaskTags(row.id, body.tags);
    this.emit();
    return this.toDTO(
      this.tasks.getById(row.id)!,
      this.tags.tagsForTask(row.id),
    );
  }

  updateTask(slug: string, body: TaskInput): TaskDTO {
    const row = this.requireTask(slug);

    const merged: NewTask = {
      slug: row.slug,
      name: body.name !== undefined ? (body.name ?? '').trim() : row.name,
      description:
        body.description !== undefined ? body.description : row.description,
      runtime_interval:
        body.runtime_interval !== undefined
          ? body.runtime_interval
          : row.runtime_interval,
      time_interval:
        body.time_interval !== undefined
          ? body.time_interval
          : row.time_interval,
      time_interval_unit:
        body.time_interval_unit !== undefined
          ? body.time_interval_unit
          : row.time_interval_unit,
      runtime_path:
        body.runtime_path !== undefined
          ? body.runtime_path?.trim() || null
          : row.runtime_path,
      last_maintenance: row.last_maintenance,
      last_runtime: row.last_runtime,
      seed_last_maintenance: row.seed_last_maintenance,
      seed_last_runtime: row.seed_last_runtime,
    };

    if (!merged.name)
      throw new ApiError(400, 'invalid_name', 'Task name is required');
    this.validateIntervals(
      merged.runtime_interval,
      merged.time_interval,
      merged.time_interval_unit,
    );

    // Slug change: normalize, uniqueness-check, remember old slug so the
    // notification path can be migrated (§6.4).
    let clearedSlug: string | undefined;
    if (
      body.slug !== undefined &&
      body.slug != null &&
      body.slug.trim() !== ''
    ) {
      const newSlug = slugify(body.slug);
      if (newSlug !== row.slug) {
        if (this.tasks.slugExists(newSlug, row.id))
          throw new ApiError(
            409,
            'slug_conflict',
            `Slug "${newSlug}" is already in use`,
          );
        merged.slug = newSlug;
        clearedSlug = row.slug;
      }
    }

    // Seed last_* may only be edited while the task has no log entries (§8.1)
    const hasLogs = this.logs.countForTask(row.id) > 0;
    if (!hasLogs) {
      if (body.last_maintenance !== undefined) {
        merged.seed_last_maintenance = body.last_maintenance;
        merged.last_maintenance = body.last_maintenance;
      }
      if (body.last_runtime !== undefined) {
        merged.seed_last_runtime = body.last_runtime;
        merged.last_runtime = body.last_runtime;
      }
    }

    this.tasks.update(row.id, merged, this.now().toISOString());
    if (body.tags !== undefined) this.tags.setTaskTags(row.id, body.tags ?? []);
    this.emit({ clearedSlug });
    return this.toDTO(
      this.tasks.getById(row.id)!,
      this.tags.tagsForTask(row.id),
    );
  }

  deleteTask(slug: string): void {
    const row = this.requireTask(slug);
    this.tasks.delete(row.id); // cascades to log_entries + task_tags
    this.tags.pruneOrphans();
    this.emit({ clearedSlug: row.slug });
  }

  // ---- logs ----

  listTaskLogs(slug: string): LogRow[] {
    const row = this.requireTask(slug);
    return this.logs.listForTask(row.id);
  }

  listMasterLog(
    q: Omit<MasterLogQuery, 'page' | 'pageSize'> & {
      page?: number;
      pageSize?: number;
    },
  ): Page<LogDTO> {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, q.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const { data, total } = this.logs.listMaster({ ...q, page, pageSize });
    return { data, total, page, pageSize };
  }

  addLog(slug: string, body: LogInput, loggedBy: string | null): LogRow {
    const task = this.requireTask(slug);
    const date = this.validateDate(body.maintenance_date, 'maintenance_date');
    const nowIso = this.now().toISOString();

    // multi-write path (§5.6): insert + denormalization update, atomically
    this.db.exec('BEGIN');
    let entry: LogRow;
    try {
      entry = this.logs.insert(
        {
          task_id: task.id,
          maintenance_date: date,
          runtime_hours: body.runtime_hours ?? null,
          notes: body.notes ?? null,
          logged_by: loggedBy,
        },
        nowIso,
      );
      this.recomputeDenorm(task.id);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this.emit();
    return entry;
  }

  updateLog(id: number, body: LogInput): LogRow {
    const existing = this.logs.get(id);
    if (!existing)
      throw new ApiError(404, 'not_found', `Log entry ${id} not found`);
    const date =
      body.maintenance_date !== undefined
        ? this.validateDate(body.maintenance_date, 'maintenance_date')
        : existing.maintenance_date;

    this.db.exec('BEGIN');
    try {
      this.logs.update(id, {
        maintenance_date: date,
        runtime_hours:
          body.runtime_hours !== undefined
            ? body.runtime_hours
            : existing.runtime_hours,
        notes: body.notes !== undefined ? body.notes : existing.notes,
      });
      this.recomputeDenorm(existing.task_id);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this.emit();
    return this.logs.get(id)!;
  }

  deleteLog(id: number): void {
    const existing = this.logs.get(id);
    if (!existing)
      throw new ApiError(404, 'not_found', `Log entry ${id} not found`);
    this.db.exec('BEGIN');
    try {
      this.logs.delete(id);
      this.recomputeDenorm(existing.task_id);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this.emit();
  }

  // ---- tags ----

  listTags(): TagCount[] {
    return this.tags.listWithCounts();
  }

  // ---- misc ----

  runtimePaths(): string[] {
    return this.tasks.runtimePaths();
  }

  health(): { tasks: number; logEntries: number; runtimePaths: string[] } {
    return {
      tasks: this.tasks.count(),
      logEntries: this.logs.count(),
      runtimePaths: this.tasks.runtimePaths(),
    };
  }

  // ---- internals ----

  /**
   * §5.6: keep tasks.last_maintenance / last_runtime equal to the latest log
   * entry, falling back to the creation-time seed values when no logs remain.
   */
  private recomputeDenorm(taskId: number): void {
    const task = this.tasks.getById(taskId);
    if (!task) return;
    const latest = this.logs.latestForTask(taskId);
    if (latest) {
      this.tasks.setLast(taskId, latest.maintenance_date, latest.runtime_hours);
    } else {
      this.tasks.setLast(
        taskId,
        task.seed_last_maintenance,
        task.seed_last_runtime,
      );
    }
  }

  private requireTask(slug: string): TaskRow {
    const row = this.tasks.getBySlug(slug);
    if (!row) throw new ApiError(404, 'not_found', `Task "${slug}" not found`);
    return row;
  }

  private validateIntervals(
    runtimeInterval: number | null | undefined,
    timeInterval: number | null | undefined,
    timeUnit: string | null | undefined,
  ): void {
    if (
      runtimeInterval != null &&
      (typeof runtimeInterval !== 'number' || runtimeInterval <= 0)
    )
      throw new ApiError(
        400,
        'invalid_interval',
        'runtime_interval must be a positive number',
      );
    const hasMagnitude = timeInterval != null;
    const hasUnit = timeUnit != null;
    if (hasMagnitude !== hasUnit)
      throw new ApiError(
        400,
        'invalid_interval',
        'time_interval and time_interval_unit must be set (or cleared) together',
      );
    if (hasMagnitude && (typeof timeInterval !== 'number' || timeInterval <= 0))
      throw new ApiError(
        400,
        'invalid_interval',
        'time_interval must be a positive number',
      );
    if (hasUnit && !TIME_UNITS.includes(timeUnit as never))
      throw new ApiError(
        400,
        'invalid_interval',
        `time_interval_unit must be one of ${TIME_UNITS.join(', ')}`,
      );
  }

  private validateDate(value: string | undefined, field: string): string {
    if (!value || Number.isNaN(new Date(value).getTime()))
      throw new ApiError(
        400,
        'invalid_date',
        `${field} must be a valid ISO-8601 timestamp`,
      );
    return new Date(value).toISOString();
  }
}
