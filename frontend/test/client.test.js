import { describe, it, expect } from 'vitest';
import {
  apiFetch,
  buildQuery,
  ApiError,
  API_BASE,
} from '../../public/app/api/client.js';
import { loginModalOpen, authState } from '../../public/app/auth/auth.js';
import { mockFetch } from './helpers.js';

describe('buildQuery', () => {
  it('skips empty values and prefixes ?', () => {
    expect(
      buildQuery({ search: 'oil', page: 2, tags: '', sort: undefined }),
    ).toBe('?search=oil&page=2');
    expect(buildQuery({})).toBe('');
    expect(buildQuery()).toBe('');
  });
});

describe('apiFetch', () => {
  it('prefixes the API base and parses JSON', async () => {
    const fn = mockFetch([
      { match: (m, u) => u.indexOf('/api/tasks') !== -1, body: { data: [] } },
    ]);
    const body = await apiFetch('/tasks');
    expect(body).toEqual({ data: [] });
    expect(String(fn.mock.calls[0][0])).toBe(API_BASE + '/tasks');
    expect(fn.mock.calls[0][1].credentials).toBe('same-origin');
  });

  it('sends JSON bodies with content-type', async () => {
    const fn = mockFetch([{ match: () => true, status: 201, body: { id: 1 } }]);
    await apiFetch('/tasks', { method: 'POST', body: { name: 'x' } });
    const init = fn.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ name: 'x' });
  });

  it('throws ApiError with the server error shape', async () => {
    mockFetch([
      {
        match: () => true,
        status: 404,
        body: { error: { code: 'not_found', message: 'no such task' } },
      },
    ]);
    const err = await apiFetch('/tasks/nope').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('no such task');
  });

  it('marks the session logged out and opens the login modal on 401 (§7.6)', async () => {
    authState.value = { checked: true, isLoggedIn: true, username: 'admin' };
    mockFetch([
      {
        match: () => true,
        status: 401,
        body: { error: { code: 'unauthorized', message: 'nope' } },
      },
    ]);
    await apiFetch('/tasks').catch(() => {});
    expect(authState.value.isLoggedIn).toBe(false);
    expect(loginModalOpen.value).toBe(true);
  });

  it('returns null for 204', async () => {
    mockFetch([{ match: () => true, status: 204 }]);
    expect(await apiFetch('/tasks/x', { method: 'DELETE' })).toBeNull();
  });
});
