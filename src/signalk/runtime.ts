import type { DatabaseSync } from 'node:sqlite';

/** Floor between runtime_cache commits — deltas can arrive many times per
 * second, and persisting each one hammers the disk. */
export const FLUSH_INTERVAL_MS = 60_000;

/** Throttle applied to each subscribed path (policy 'instant'): the first
 * delta arrives immediately, then at most one per interval. */
export const SUBSCRIBE_MIN_PERIOD_MS = 5000;

/**
 * Subscribes to the union of all task runtime paths on vessels.self, keeps an
 * in-memory map of the latest value, and persists it to runtime_cache so
 * values survive restarts (§10.2).
 *
 * Deltas only touch the in-memory map; dirty values are flushed to the DB in
 * one transaction at most once per FLUSH_INTERVAL_MS (and on stop()).
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
  private dirty = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private app: any,
    private db: DatabaseSync,
    private flushIntervalMs: number = FLUSH_INTERVAL_MS,
  ) {
    this.loadCache();
  }

  private loadCache(): void {
    const rows = this.db
      .prepare(`SELECT path, value, timestamp FROM runtime_cache`)
      .all() as unknown as { path: string; value: number; timestamp: string }[];
    for (const r of rows)
      this.values.set(r.path, { value: r.value, timestamp: r.timestamp });
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
        subscribe: next.map((path) => ({
          path,
          // minPeriod (not period) is the throttle that goes with policy
          // 'instant' — period implies policy 'fixed' and the server logs a
          // warning if both are given. Runtime hours creep upward slowly, so
          // one delta per SUBSCRIBE_MIN_PERIOD_MS per path is plenty.
          minPeriod: SUBSCRIBE_MIN_PERIOD_MS,
          policy: 'instant',
        })),
      },
      this.unsubscribes,
      (err: unknown) => {
        this.app.error?.(
          `maintenance-tracker runtime subscription error: ${err}`,
        );
      },
      (delta: any) => this.handleDelta(delta),
    );
  }

  handleDelta(delta: any): void {
    let changed = false;
    for (const update of delta?.updates ?? []) {
      for (const v of update?.values ?? []) {
        if (typeof v?.value !== 'number' || !this.paths.includes(v.path))
          continue;
        const hours = v.value / 3600; // SignalK runtime is seconds (§10.2)
        const timestamp = new Date().toISOString();
        this.values.set(v.path, { value: hours, timestamp });
        this.dirty.add(v.path);
        this.lastUpdate = timestamp;
        changed = true;
      }
    }
    if (changed) {
      this.scheduleFlush();
      for (const fn of this.listeners) fn();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.flushIntervalMs);
    this.flushTimer.unref?.();
  }

  /** Persist all dirty values in a single transaction. */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.dirty.size) return;
    const upsert = this.db.prepare(
      `INSERT INTO runtime_cache (path, value, timestamp) VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET value = excluded.value, timestamp = excluded.timestamp`,
    );
    this.db.exec('BEGIN');
    try {
      for (const path of this.dirty) {
        const entry = this.values.get(path);
        if (entry) upsert.run(path, entry.value, entry.timestamp);
      }
      this.db.exec('COMMIT');
      this.dirty.clear();
    } catch (err) {
      this.db.exec('ROLLBACK');
      this.app.error?.(
        `maintenance-tracker runtime cache flush failed: ${err}`,
      );
    }
  }

  stop(): void {
    // Flush before the plugin closes the DB so values survive restarts.
    this.flush();
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
