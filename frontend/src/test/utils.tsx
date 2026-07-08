import { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { Page, TaskDTO } from '../types';

export function makeTask(overrides: Partial<TaskDTO> = {}): TaskDTO {
  return {
    id: 1,
    slug: 'engine-oil-change',
    name: 'Engine oil change',
    description: null,
    tags: ['Engines'],
    runtime_interval: 200,
    time_interval: null,
    time_interval_unit: null,
    runtime_path: 'propulsion.port.runTime',
    last_maintenance: '2026-01-15T10:00:00.000Z',
    last_runtime: 1240.5,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    current_runtime: 1360,
    elapsed_runtime: 119.5,
    remaining_runtime: 80.5,
    due_runtime_at: 1440.5,
    runtime_fraction: 0.5975,
    due_date: null,
    remaining_time_ms: null,
    time_fraction: null,
    runtime_status: 'ok',
    time_status: null,
    status: 'ok',
    status_rank: 2,
    urgency: 0.5975,
    ...overrides,
  };
}

export function page<T>(data: T[]): Page<T> {
  return { data, total: data.length, page: 1, pageSize: 20 };
}

export interface FetchRoute {
  /** substring matched against `${method} ${url}` */
  match: string;
  status?: number;
  body?: unknown;
}

/**
 * Install a fetch stub answering from a routes table. Returns the mock so
 * tests can assert on calls. Unmatched requests 404 with an empty body.
 */
export function mockFetch(routes: FetchRoute[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const key = `${init?.method ?? 'GET'} ${url}`;
    const route = routes.find((r) => key.includes(r.match));
    const status = route?.status ?? (route ? 200 : 404);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => route?.body ?? {},
    } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Providers matching main.tsx, minus polling (retry off, MemoryRouter). */
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <ModalsProvider>
          <MemoryRouter initialEntries={[route]}>
            <AuthProvider>{children}</AuthProvider>
          </MemoryRouter>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
  return render(ui, { wrapper });
}
