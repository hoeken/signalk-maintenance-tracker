/** SignalK alarm states, most to least severe (plus "none" = no notification). */
export type AlarmState =
  'none' | 'normal' | 'alert' | 'warn' | 'alarm' | 'emergency';

const ALARM_STATES: AlarmState[] = [
  'none',
  'normal',
  'alert',
  'warn',
  'alarm',
  'emergency',
];

export interface PluginOptions {
  enablePublishPaths: boolean;
  enableNotifications: boolean;
  alarmStateOk: AlarmState;
  alarmStateDueSoon: AlarmState;
  alarmStateOverdue: AlarmState;
  runtimeNotifyLeadHours: number;
  timeNotifyLeadDays: number;
  recomputeIntervalMs: number;
  /** Base URL for signalk-stowage-mgmt's API, e.g.
   * http://localhost:3000/plugins/signalk-stowage-mgmt. Empty string
   * disables the inventory integration entirely (default) — this is an
   * explicit opt-in, not autodetected (docs/inventory-interaction.md). */
  stowageMgmtUrl: string;
}

export const DEFAULT_OPTIONS: PluginOptions = {
  enablePublishPaths: true,
  enableNotifications: true,
  alarmStateOk: 'none',
  alarmStateDueSoon: 'warn',
  alarmStateOverdue: 'alarm',
  runtimeNotifyLeadHours: 10,
  timeNotifyLeadDays: 7,
  recomputeIntervalMs: 60000,
  stowageMgmtUrl: '',
};

export function withDefaults(options?: Partial<PluginOptions>): PluginOptions {
  return { ...DEFAULT_OPTIONS, ...(options ?? {}) };
}

const alarmStateProperty = (title: string, defaultValue: AlarmState) => ({
  type: 'string',
  title,
  enum: [...ALARM_STATES],
  default: defaultValue,
});

export const schema = {
  type: 'object',
  properties: {
    enablePublishPaths: {
      type: 'boolean',
      title: 'Publish task data to SignalK paths',
      description:
        'Publish each task to maintenance.{slug}.data and its status to maintenance.{slug}.status',
      default: DEFAULT_OPTIONS.enablePublishPaths,
    },
    enableNotifications: {
      type: 'boolean',
      title: 'Enable notifications',
      description:
        'Publish overdue/upcoming status to notifications.maintenance.*',
      default: DEFAULT_OPTIONS.enableNotifications,
    },
    alarmStateOk: alarmStateProperty(
      'Alarm state for up-to-date tasks',
      DEFAULT_OPTIONS.alarmStateOk,
    ),
    alarmStateDueSoon: alarmStateProperty(
      'Alarm state for due-soon tasks',
      DEFAULT_OPTIONS.alarmStateDueSoon,
    ),
    alarmStateOverdue: alarmStateProperty(
      'Alarm state for overdue tasks',
      DEFAULT_OPTIONS.alarmStateOverdue,
    ),
    runtimeNotifyLeadHours: {
      type: 'number',
      title: 'Runtime lead window (hours)',
      minimum: 0,
      description:
        'Tasks within this many runtime hours of due are "due soon". 0 disables the warning — tasks go straight from OK to overdue. Individual tasks can override this.',
      default: DEFAULT_OPTIONS.runtimeNotifyLeadHours,
    },
    timeNotifyLeadDays: {
      type: 'number',
      title: 'Time lead window (days)',
      minimum: 0,
      description:
        'Tasks within this many days of due are "due soon". 0 disables the warning — tasks go straight from OK to overdue. Individual tasks can override this.',
      default: DEFAULT_OPTIONS.timeNotifyLeadDays,
    },
    recomputeIntervalMs: {
      type: 'number',
      title: 'Recompute interval (ms)',
      description:
        'How often to re-evaluate task status and refresh notifications',
      default: DEFAULT_OPTIONS.recomputeIntervalMs,
    },
    stowageMgmtUrl: {
      type: 'string',
      title: 'signalk-stowage-mgmt API URL',
      description:
        "Base URL for signalk-stowage-mgmt's API (e.g. http://localhost:3000/plugins/signalk-stowage-mgmt). Leave blank to disable linking tasks to inventory items.",
      default: DEFAULT_OPTIONS.stowageMgmtUrl,
    },
  },
};
