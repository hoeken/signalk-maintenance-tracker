import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/database';
import { RuntimeManager } from './runtime';

function makeStubApp() {
  const subscriptions: any[] = [];
  return {
    subscriptions,
    app: {
      subscriptionmanager: {
        subscribe: vi.fn(
          (command: any, unsubscribes: (() => void)[], _onErr: any, onDelta: any) => {
            const sub = { command, active: true, onDelta };
            unsubscribes.push(() => {
              sub.active = false;
            });
            subscriptions.push(sub);
          }
        ),
      },
      error: vi.fn(),
    },
  };
}

function delta(path: string, value: unknown) {
  return { updates: [{ values: [{ path, value }] }] };
}

describe('RuntimeManager (§10.2)', () => {
  it('subscribes to vessels.self for the given paths', () => {
    const { app, subscriptions } = makeStubApp();
    const rm = new RuntimeManager(app, openDatabase(':memory:'));
    rm.setPaths(['propulsion.port.runTime', 'propulsion.starboard.runTime']);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].command.context).toBe('vessels.self');
    expect(subscriptions[0].command.subscribe.map((s: any) => s.path)).toEqual([
      'propulsion.port.runTime',
      'propulsion.starboard.runTime',
    ]);
  });

  it('converts seconds to hours — the single conversion boundary', () => {
    const { app, subscriptions } = makeStubApp();
    const db = openDatabase(':memory:');
    const rm = new RuntimeManager(app, db);
    rm.setPaths(['propulsion.port.runTime']);
    subscriptions[0].onDelta(delta('propulsion.port.runTime', 4_896_000)); // seconds
    expect(rm.getHours('propulsion.port.runTime')).toBeCloseTo(1360);

    // persisted in hours too
    const row = db
      .prepare(`SELECT value FROM runtime_cache WHERE path = ?`)
      .get('propulsion.port.runTime') as { value: number };
    expect(row.value).toBeCloseTo(1360);
  });

  it('ignores non-numeric values and unsubscribed paths', () => {
    const { app, subscriptions } = makeStubApp();
    const rm = new RuntimeManager(app, openDatabase(':memory:'));
    rm.setPaths(['a.b']);
    subscriptions[0].onDelta(delta('a.b', 'not-a-number'));
    subscriptions[0].onDelta(delta('other.path', 3600));
    expect(rm.getHours('a.b')).toBeNull();
    expect(rm.getHours('other.path')).toBeNull();
  });

  it('survives restart via runtime_cache', () => {
    const { app, subscriptions } = makeStubApp();
    const db = openDatabase(':memory:');
    const rm = new RuntimeManager(app, db);
    rm.setPaths(['a.b']);
    subscriptions[0].onDelta(delta('a.b', 7200));
    rm.stop();

    // "restart": a fresh manager over the same DB sees the cached value
    const rm2 = new RuntimeManager(makeStubApp().app, db);
    expect(rm2.getHours('a.b')).toBeCloseTo(2);
  });

  it('rebuilds subscriptions when the path set changes, and not otherwise', () => {
    const { app, subscriptions } = makeStubApp();
    const rm = new RuntimeManager(app, openDatabase(':memory:'));
    rm.setPaths(['a.b']);
    rm.setPaths(['a.b']); // unchanged — no new subscription
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].active).toBe(true);

    rm.setPaths(['a.b', 'c.d']);
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0].active).toBe(false); // old torn down
    expect(subscriptions[1].active).toBe(true);

    rm.setPaths([]);
    expect(subscriptions[1].active).toBe(false);
  });

  it('notifies listeners on updates', () => {
    const { app, subscriptions } = makeStubApp();
    const rm = new RuntimeManager(app, openDatabase(':memory:'));
    const listener = vi.fn();
    rm.onUpdate(listener);
    rm.setPaths(['a.b']);
    subscriptions[0].onDelta(delta('a.b', 3600));
    expect(listener).toHaveBeenCalledOnce();
    subscriptions[0].onDelta(delta('x.y', 1)); // irrelevant path — no event
    expect(listener).toHaveBeenCalledOnce();
  });
});
