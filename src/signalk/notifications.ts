import { AlarmState, PluginOptions } from '../config';
import { Status, TaskDTO } from '../types';

/**
 * Publishes notifications.maintenance.{slug} deltas (§10.3). Only publishes
 * when a task's state actually changes, to avoid delta spam. The alarm state
 * for each task status is configurable; `none` publishes a null value, which
 * clears the notification.
 */
export class NotificationManager {
  private lastState = new Map<string, AlarmState>();

  constructor(
    private app: any,
    private pluginId: string,
    private opts: Pick<
      PluginOptions,
      | 'enableNotifications'
      | 'alarmStateOk'
      | 'alarmStateDueSoon'
      | 'alarmStateOverdue'
    >,
  ) {}

  private stateForStatus(status: Status): AlarmState | undefined {
    switch (status) {
      case 'ok':
        return this.opts.alarmStateOk;
      case 'due_soon':
        return this.opts.alarmStateDueSoon;
      case 'overdue':
        return this.opts.alarmStateOverdue;
      default:
        return undefined; // unknown
    }
  }

  publishAll(tasks: TaskDTO[]): void {
    if (!this.opts.enableNotifications) return;
    for (const task of tasks) {
      const state = this.stateForStatus(task.status);
      if (!state) {
        // unknown: publish nothing, but clear a previously-raised notification
        const last = this.lastState.get(task.slug);
        if (last && last !== 'none') {
          this.send(task.slug, 'none', `${task.name}: status unknown`);
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
    this.send(slug, 'none', 'Maintenance notification cleared');
    this.lastState.delete(slug);
  }

  private send(slug: string, state: AlarmState, message: string): void {
    // `none` clears the notification: SignalK removes a notification whose
    // delta value is null.
    const value =
      state === 'none'
        ? null
        : {
            state,
            method: ['visual'],
            message,
            timestamp: new Date().toISOString(),
          };
    this.app.handleMessage(this.pluginId, {
      updates: [
        {
          values: [
            {
              path: `notifications.maintenance.${slug}`,
              value,
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
