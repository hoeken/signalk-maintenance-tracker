import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/preact';
import {
  useResource,
  invalidate,
  invalidateAll,
} from '../../public/app/api/resource.js';

describe('useResource (§7.6)', () => {
  it('fetches on first subscribe and exposes data', async () => {
    const fetcher = vi.fn(async () => 'payload');
    const { result } = renderHook(() => useResource('k1', fetcher));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('payload'));
    expect(result.current.loading).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('dedupes by key across subscribers', async () => {
    const fetcher = vi.fn(async () => 'shared');
    const a = renderHook(() => useResource('k2', fetcher));
    const b = renderHook(() => useResource('k2', fetcher));
    await waitFor(() => expect(a.result.current.data).toBe('shared'));
    expect(b.result.current.data).toBe('shared');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps stale data and surfaces the error on failure', async () => {
    let fail = false;
    const fetcher = vi.fn(async () => {
      if (fail) throw new Error('boom');
      return 'good';
    });
    const { result } = renderHook(() => useResource('k3', fetcher));
    await waitFor(() => expect(result.current.data).toBe('good'));
    fail = true;
    invalidate('k3');
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.data).toBe('good');
  });

  it('invalidate refetches live keys by prefix without touching cousins', async () => {
    const tasksFetcher = vi.fn(async () => 'tasks');
    const taskFetcher = vi.fn(async () => 'task');
    const t1 = renderHook(() => useResource('tasks?page=1', tasksFetcher));
    const t2 = renderHook(() => useResource('task/x', taskFetcher));
    await waitFor(() => expect(t1.result.current.data).toBe('tasks'));
    await waitFor(() => expect(t2.result.current.data).toBe('task'));
    invalidate('tasks');
    await waitFor(() => expect(tasksFetcher).toHaveBeenCalledTimes(2));
    expect(taskFetcher).toHaveBeenCalledTimes(1);
  });

  it('polls while subscribed and stops after unmount', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => 'tick');
      const { unmount } = renderHook(() =>
        useResource('k4', fetcher, { refetchInterval: 5000 }),
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetcher).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetcher).toHaveBeenCalledTimes(3);
      unmount();
      await vi.advanceTimersByTimeAsync(20000);
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalidateAll refetches every live resource', async () => {
    const f1 = vi.fn(async () => 1);
    const f2 = vi.fn(async () => 2);
    renderHook(() => useResource('a', f1));
    renderHook(() => useResource('b', f2));
    await waitFor(() => expect(f1).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(f2).toHaveBeenCalledTimes(1));
    invalidateAll();
    await waitFor(() => expect(f1).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(f2).toHaveBeenCalledTimes(2));
  });
});
