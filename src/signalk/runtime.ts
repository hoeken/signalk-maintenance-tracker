import type { DatabaseSync } from 'node:sqlite';

/**
 * Subscribes to the union of all task runtime paths on vessels.self, keeps an
 * in-memory map of the latest value, and persists it to runtime_cache so
 * values survive restarts (§10.2).
 *
 * This is the single seconds→hours conversion boundary: SignalK runtime paths
 * are seconds; everything stored/returned here is hours.
 */
export class RuntimeManager {
  private values = new Map<string, { value: number; timestamp: string }>();
  private paths: string[] = [];
  private unsubscribes: (() => void)[] = [];
  private listeners: (() => void)[] = [];
  private lastUpdate: string | null = null;

  constructor(
    private app: any,
    private db: DatabaseSync
  ) {
    this.loadCache();
  }

  private loadCache(): void {
    const rows = this.db
      .prepare(`SELECT path, value, timestamp FROM runtime_cache`)
      .all() as unknown as { path: string; value: number; timestamp: string }[];
    for (const r of rows) this.values.set(r.path, { value: r.value, timestamp: r.timestamp });
  }

  /** Latest runtime in hours for a path, or null if never seen. */
  getHours(path: string): number | null {
    return this.values.get(path)?.value ?? null;
  }

  get subscribedPaths(): string[] {
    return [...this.paths];
  }

  get lastUpdateAt(): string | null {
    return this.lastUpdate;
  }

  onUpdate(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** (Re)subscribe to a new set of paths; no-op if the set is unchanged. */
  setPaths(paths: string[]): void {
    const next = [...new Set(paths)].sort();
    if (next.join('\n') === this.paths.join('\n')) return;
    this.teardown();
    this.paths = next;
    if (!next.length) return;

    this.app.subscriptionmanager.subscribe(
      {
        context: 'vessels.self',
        subscribe: next.map((path) => ({ path, period: 5000, policy: 'instant' })),
      },
      this.unsubscribes,
      (err: unknown) => {
        this.app.error?.(`maintenance-tracker runtime subscription error: ${err}`);
      },
      (delta: any) => this.handleDelta(delta)
    );
  }

  handleDelta(delta: any): void {
    let changed = false;
    for (const update of delta?.updates ?? []) {
      for (const v of update?.values ?? []) {
        if (typeof v?.value !== 'number' || !this.paths.includes(v.path)) continue;
        const hours = v.value / 3600; // SignalK runtime is seconds (§10.2)
        const timestamp = new Date().toISOString();
        this.values.set(v.path, { value: hours, timestamp });
        this.db
          .prepare(
            `INSERT INTO runtime_cache (path, value, timestamp) VALUES (?, ?, ?)
             ON CONFLICT(path) DO UPDATE SET value = excluded.value, timestamp = excluded.timestamp`
          )
          .run(v.path, hours, timestamp);
        this.lastUpdate = timestamp;
        changed = true;
      }
    }
    if (changed) for (const fn of this.listeners) fn();
  }

  stop(): void {
    this.teardown();
    this.paths = [];
  }

  private teardown(): void {
    for (const unsub of this.unsubscribes) {
      try {
        unsub();
      } catch {
        // ignore teardown errors
      }
    }
    this.unsubscribes = [];
  }
}
