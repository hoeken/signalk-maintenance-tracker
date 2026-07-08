import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setUnauthorizedHandler, toQueryString } from './client';

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe('api client (§7.6)', () => {
  it('prefixes the API base and sends same-origin credentials', async () => {
    const fetchMock = stubFetch(200, { data: [] });
    await api('/tasks');
    expect(fetchMock).toHaveBeenCalledWith(
      '/plugins/signalk-maintenance-tracker/api/tasks',
      expect.objectContaining({ credentials: 'same-origin' })
    );
  });

  it('serializes JSON bodies with content-type', async () => {
    const fetchMock = stubFetch(201, {});
    await api('/tasks', { method: 'POST', body: { name: 'X' } });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      })
    );
  });

  it('normalizes spec error shapes into ApiError', async () => {
    stubFetch(409, { error: { code: 'slug_conflict', message: 'Slug taken' } });
    await expect(api('/tasks', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 409,
      code: 'slug_conflict',
      message: 'Slug taken',
    });
  });

  it('handles non-JSON error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('no json');
        },
      }))
    );
    await expect(api('/tasks')).rejects.toBeInstanceOf(ApiError);
  });

  it('invokes the unauthorized handler on 401/403', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubFetch(401, {});
    await expect(api('/tasks')).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('toQueryString', () => {
  it('serializes params, joining arrays as csv and dropping empties', () => {
    expect(
      toQueryString({ search: 'oil', tags: ['a', 'b'], page: 2, empty: '', missing: undefined })
    ).toBe('?search=oil&tags=a%2Cb&page=2');
    expect(toQueryString({})).toBe('');
    expect(toQueryString({ tags: [] })).toBe('');
  });
});
