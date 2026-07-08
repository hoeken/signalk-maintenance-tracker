import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { api, toQueryString } from './client';
import {
  LogEntry,
  LogInput,
  MasterLogEntry,
  MasterLogParams,
  Page,
  TagCount,
  TaskDTO,
  TaskInput,
  TaskListParams,
} from '../types';

/** Live-updating = react-query polling the REST endpoints (§2). */
export const POLL_INTERVAL_MS = 5000;

export function useTasks(params: TaskListParams) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => api<Page<TaskDTO>>(`/tasks${toQueryString(params)}`),
    refetchInterval: POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useTask(slug: string) {
  return useQuery({
    queryKey: ['task', slug],
    queryFn: () => api<TaskDTO>(`/tasks/${encodeURIComponent(slug)}`),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useTaskLogs(slug: string) {
  return useQuery({
    queryKey: ['taskLogs', slug],
    queryFn: () => api<{ data: LogEntry[] }>(`/tasks/${encodeURIComponent(slug)}/logs`),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useLogs(params: MasterLogParams) {
  return useQuery({
    queryKey: ['logs', params],
    queryFn: () => api<Page<MasterLogEntry>>(`/logs${toQueryString(params)}`),
    refetchInterval: POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => api<{ data: TagCount[] }>('/tags'),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['tasks', 'task', 'taskLogs', 'logs', 'tags']) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useCreateTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: TaskInput) => api<TaskDTO>('/tasks', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ slug, body }: { slug: string; body: TaskInput }) =>
      api<TaskDTO>(`/tasks/${encodeURIComponent(slug)}`, { method: 'PUT', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (slug: string) =>
      api<void>(`/tasks/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/** "Mark complete" — POST /tasks/:slug/logs (§8.2). */
export function useAddLog() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ slug, body }: { slug: string; body: LogInput }) =>
      api<LogEntry>(`/tasks/${encodeURIComponent(slug)}/logs`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateLog() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: LogInput }) =>
      api<LogEntry>(`/logs/${id}`, { method: 'PUT', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteLog() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/logs/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
