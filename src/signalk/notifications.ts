import { PluginOptions } from '../config';
import { Status, TaskDTO } from '../types';

type NotificationState = 'alarm' | 'warn' | 'normal';

const STATE_FOR_STATUS: Partial<Record<Status, NotificationState>> = {
  overdue: 'alarm',
  due_soon: 'warn',
  ok: 'normal',
};

/**
 * Publishes notifications.maintenance.{slug} deltas (§10.3). Only publishes
 * when a task's state actually changes, to avoid delta spam.
 */
export class NotificationManager {
  private lastState = new Map<string, NotificationState>();

  constructor(
    private app: any,
    private pluginId: string,
    private opts: Pick<
      PluginOptions,
      'enableNotifications' | 'notificationMethods'
    >,
  ) {}

  publishAll(tasks: TaskDTO[]): void {
    if (!this.opts.enableNotifications) return;
    for (const task of tasks) {
      const state = STATE_FOR_STATUS[task.status];
      if (!state) {
        // unknown: publish nothing, but clear a previously-raised alarm/warn
        if (
          this.lastState.get(task.slug) &&
          this.lastState.get(task.slug) !== 'normal'
        ) {
          this.send(task.slug, 'normal', `${task.name}: status unknown`);
        }
        continue;
      }
      if (this.lastState.get(task.slug) === state) continue;
      this.send(task.slug, state, buildMessage(task));
    }
  }

  /** Clear a slug's notification (task deleted or slug renamed, §6.4). */
  clear(slug: string): void {
    if (!this.opts.enableNotifications) return;
    if (this.lastState.get(slug) === undefined) {
      // nothing ever published under this slug in this process — clear anyway
      // in case a previous run left one behind
    }
    this.send(slug, 'normal', 'Maintenance notification cleared');
    this.lastState.delete(slug);
  }

  private send(slug: string, state: NotificationState, message: string): void {
    this.app.handleMessage(this.pluginId, {
      updates: [
        {
          values: [
            {
              path: `notifications.maintenance.${slug}`,
              value: {
                state,
                method: this.opts.notificationMethods,
                message,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        },
      ],
    });
    this.lastState.set(slug, state);
  }
}

/**
 * Human message naming the dimension that triggered the status (§10.3). When
 * both dimensions share the status, the one further along (higher fraction)
 * wins.
 */
export function buildMessage(task: TaskDTO): string {
  const { status, name } = task;
  if (status === 'ok') return `${name} is up to date`;

  const runtimeTriggered = task.runtime_status === status;
  const timeTriggered = task.time_status === status;
  let useRuntime = runtimeTriggered;
  if (runtimeTriggered && timeTriggered) {
    useRuntime = (task.runtime_fraction ?? 0) >= (task.time_fraction ?? 0);
  }

  if (status === 'overdue') {
    if (useRuntime && task.remaining_runtime != null) {
      return `${name} is overdue by ${round1(-task.remaining_runtime)} runtime hours`;
    }
    if (task.remaining_time_ms != null) {
      return `${name} is overdue by ${daysText(-task.remaining_time_ms)}`;
    }
    return `${name} is overdue`;
  }

  // due_soon
  if (useRuntime && task.remaining_runtime != null) {
    return `${name} is due in ${round1(task.remaining_runtime)} runtime hours`;
  }
  if (task.remaining_time_ms != null) {
    return `${name} is due in ${daysText(task.remaining_time_ms)}`;
  }
  return `${name} is due soon`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function daysText(ms: number): string {
  const days = Math.max(0, Math.round(ms / 86_400_000));
  return days === 1 ? '1 day' : `${days} days`;
}
