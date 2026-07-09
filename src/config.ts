export interface PluginOptions {
  enableNotifications: boolean;
  notificationMethods: string[];
  runtimeNotifyLeadHours: number;
  timeNotifyLeadDays: number;
  recomputeIntervalMs: number;
}

export const DEFAULT_OPTIONS: PluginOptions = {
  enableNotifications: true,
  notificationMethods: ['visual'],
  runtimeNotifyLeadHours: 10,
  timeNotifyLeadDays: 7,
  recomputeIntervalMs: 60000,
};

export function withDefaults(options?: Partial<PluginOptions>): PluginOptions {
  return { ...DEFAULT_OPTIONS, ...(options ?? {}) };
}

export const schema = {
  type: 'object',
  properties: {
    enableNotifications: {
      type: 'boolean',
      title: 'Enable notifications',
      description:
        'Publish overdue/upcoming status to notifications.maintenance.*',
      default: DEFAULT_OPTIONS.enableNotifications,
    },
    notificationMethods: {
      type: 'array',
      title: 'Notification methods',
      items: { type: 'string', enum: ['visual', 'sound'] },
      default: DEFAULT_OPTIONS.notificationMethods,
    },
    runtimeNotifyLeadHours: {
      type: 'number',
      title: 'Runtime lead window (hours)',
      description: 'Tasks within this many runtime hours of due are "due soon"',
      default: DEFAULT_OPTIONS.runtimeNotifyLeadHours,
    },
    timeNotifyLeadDays: {
      type: 'number',
      title: 'Time lead window (days)',
      description: 'Tasks within this many days of due are "due soon"',
      default: DEFAULT_OPTIONS.timeNotifyLeadDays,
    },
    recomputeIntervalMs: {
      type: 'number',
      title: 'Recompute interval (ms)',
      description:
        'How often to re-evaluate task status and refresh notifications',
      default: DEFAULT_OPTIONS.recomputeIntervalMs,
    },
  },
};
