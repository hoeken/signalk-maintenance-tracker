import { PluginOptions } from '../config';
import { TaskDTO } from '../types';

/**
 * Publishes each task to maintenance.{slug}.* SignalK paths: the full task
 * JSON (the same DTO the /tasks API returns) under `.data`, and the status
 * string under `.status`. Deduplicates by the last-published payload per slug
 * so unchanged tasks don't spam deltas on every recompute.
 */
export class PathPublisher {
  private lastPublished = new Map<string, string>();

  constructor(
    private app: any,
    private pluginId: string,
    private opts: Pick<PluginOptions, 'enablePublishPaths'>,
  ) {}

  publishAll(tasks: TaskDTO[]): void {
    if (!this.opts.enablePublishPaths) return;
    const values: { path: string; value: unknown }[] = [];
    for (const task of tasks) {
      const serialized = JSON.stringify(task);
      if (this.lastPublished.get(task.slug) === serialized) continue;
      this.lastPublished.set(task.slug, serialized);
      values.push({ path: `maintenance.${task.slug}.data`, value: task });
      values.push({
        path: `maintenance.${task.slug}.status`,
        value: task.status,
      });
    }
    if (values.length) this.send(values);
  }

  /** Clear a slug's paths (task deleted or slug renamed). */
  clear(slug: string): void {
    if (!this.opts.enablePublishPaths) return;
    this.lastPublished.delete(slug);
    this.send([
      { path: `maintenance.${slug}.data`, value: null },
      { path: `maintenance.${slug}.status`, value: null },
    ]);
  }

  private send(values: { path: string; value: unknown }[]): void {
    this.app.handleMessage(this.pluginId, {
      updates: [{ values }],
    });
  }
}
