import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Router } from 'express';
import { PluginOptions, schema, withDefaults } from './config';
import { openDatabase } from './db/database';
import { MaintenanceService } from './service';
import { NotificationManager } from './signalk/notifications';
import { PathPublisher } from './signalk/paths';
import { RuntimeManager } from './signalk/runtime';
import { mountApi, Services } from './api/router';
import { StowageClient } from './stowage/client';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: PLUGIN_VERSION } = require('../package.json');

const PLUGIN_ID = 'signalk-maintenance-tracker';

export = function (app: any) {
  let db: DatabaseSync | null = null;
  let runtime: RuntimeManager | null = null;
  let notifier: NotificationManager | null = null;
  let publisher: PathPublisher | null = null;
  let service: MaintenanceService | null = null;
  let timer: NodeJS.Timeout | null = null;
  let services: Services | null = null;

  function recomputeNotifications(): void {
    if (!service) return;
    try {
      const computed = service.listAllComputed();
      notifier?.publishAll(computed);
      publisher?.publishAll(computed);
    } catch (err) {
      app.error?.(`${PLUGIN_ID}: notification recompute failed: ${err}`);
    }
  }

  function refresh(): void {
    if (!service || !runtime) return;
    runtime.setPaths(service.runtimePaths());
    recomputeNotifications();
  }

  const plugin = {
    id: PLUGIN_ID,
    name: 'Maintenance Tracker',
    description:
      'Track recurring boat maintenance tasks with runtime- and time-based intervals.',
    schema,

    start(options: Partial<PluginOptions>) {
      const opts = withDefaults(options);
      try {
        const dbPath = path.join(app.getDataDirPath(), 'maintenance.db');
        db = openDatabase(dbPath);
        runtime = new RuntimeManager(app, db);
        notifier = new NotificationManager(app, PLUGIN_ID, opts);
        publisher = new PathPublisher(app, PLUGIN_ID, opts);
        service = new MaintenanceService(db, {
          getRuntime: (p) => runtime!.getHours(p),
          config: {
            runtimeNotifyLeadHours: opts.runtimeNotifyLeadHours,
            timeNotifyLeadDays: opts.timeNotifyLeadDays,
          },
          onMutation: (event) => {
            if (event.clearedSlug) {
              notifier?.clear(event.clearedSlug);
              publisher?.clear(event.clearedSlug);
            }
            refresh();
          },
          stowageClient: opts.stowageMgmtUrl
            ? new StowageClient({ baseUrl: opts.stowageMgmtUrl })
            : undefined,
        });
        runtime.onUpdate(() => recomputeNotifications());
        services = { service, runtime, version: PLUGIN_VERSION };

        refresh();
        timer = setInterval(recomputeNotifications, opts.recomputeIntervalMs);

        app.setPluginStatus?.(
          `Started — ${service.health().tasks} tasks, DB at ${dbPath}`,
        );
        app.debug?.(`${PLUGIN_ID} started`);
      } catch (err) {
        app.setPluginError?.(`Failed to start: ${err}`);
        throw err;
      }
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      runtime?.stop();
      services = null;
      service = null;
      notifier = null;
      publisher = null;
      runtime = null;
      try {
        db?.close();
      } catch {
        // already closed
      }
      db = null;
      app.debug?.(`${PLUGIN_ID} stopped`);
    },

    registerWithRouter(router: Router) {
      // May be called before start(); handlers respond 503 until started.
      mountApi(router, () => services);
    },
  };

  return plugin;
};
