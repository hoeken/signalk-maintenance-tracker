/**
 * Signals-backed resource hooks + mutations over the plugin REST API (§7.6).
 * Mutations invalidate the affected keys on success so the UI updates
 * immediately instead of waiting for the next poll.
 */
import { apiFetch, buildQuery } from './client.js';
import { useResource, invalidate } from './resource.js';

/** @typedef {import('../types.js').TaskDTO} TaskDTO */
/** @typedef {import('../types.js').LogDTO} LogDTO */
/** @typedef {import('../types.js').TagDTO} TagDTO */
/** @typedef {import('../types.js').TaskInput} TaskInput */
/** @typedef {import('../types.js').LogInput} LogInput */

/** Default poll interval for live-updating lists (§7.6). */
export const POLL_MS = 5000;

/** @param {string} slug */
function encodeSlug(slug) {
  return encodeURIComponent(slug);
}

/**
 * @param {Record<string, string|number|undefined|null>} [params]
 * @returns {import('./resource.js').ResourceState<import('../types.js').Page<TaskDTO>>}
 */
export function useTasks(params) {
  const query = buildQuery(params);
  return useResource('tasks' + query, () => apiFetch('/tasks' + query), { refetchInterval: POLL_MS });
}

/**
 * @param {string} slug
 * @returns {import('./resource.js').ResourceState<TaskDTO>}
 */
export function useTask(slug) {
  return useResource('task/' + slug, () => apiFetch('/tasks/' + encodeSlug(slug)), {
    refetchInterval: POLL_MS,
  });
}

/**
 * @param {string} slug
 * @returns {import('./resource.js').ResourceState<{data: LogDTO[]}>}
 */
export function useTaskLogs(slug) {
  return useResource('task/' + slug + '/logs', () => apiFetch('/tasks/' + encodeSlug(slug) + '/logs'), {
    refetchInterval: POLL_MS,
  });
}

/**
 * @param {Record<string, string|number|undefined|null>} [params]
 * @returns {import('./resource.js').ResourceState<import('../types.js').Page<LogDTO>>}
 */
export function useLogs(params) {
  const query = buildQuery(params);
  return useResource('logs' + query, () => apiFetch('/logs' + query), { refetchInterval: POLL_MS });
}

/**
 * @returns {import('./resource.js').ResourceState<{data: TagDTO[]}>}
 */
export function useTags() {
  return useResource('tags', () => apiFetch('/tags'), { refetchInterval: POLL_MS });
}

/**
 * Plugin health/version (§8.5). Fetched once; the version can't change
 * without a server restart, so no polling.
 * @returns {import('./resource.js').ResourceState<{version: string}>}
 */
export function useHealth() {
  return useResource('health', () => apiFetch('/health'));
}

// ---- mutations ----

/**
 * @param {TaskInput} input
 * @returns {Promise<TaskDTO>}
 */
export async function createTask(input) {
  const task = await apiFetch('/tasks', { method: 'POST', body: input });
  invalidate('tasks', 'tags');
  return task;
}

/**
 * @param {string} slug
 * @param {TaskInput} input
 * @returns {Promise<TaskDTO>}
 */
export async function updateTask(slug, input) {
  const task = await apiFetch('/tasks/' + encodeSlug(slug), { method: 'PUT', body: input });
  invalidate('tasks', 'task/' + slug, 'tags', 'logs');
  if (task && task.slug !== slug) invalidate('task/' + task.slug);
  return task;
}

/** @param {string} slug */
export async function deleteTask(slug) {
  await apiFetch('/tasks/' + encodeSlug(slug), { method: 'DELETE' });
  invalidate('tasks', 'task/' + slug, 'tags', 'logs');
}

/**
 * Mark complete (§7.5): create a log entry for the task.
 * @param {string} slug
 * @param {LogInput} input
 * @returns {Promise<LogDTO>}
 */
export async function addLog(slug, input) {
  const entry = await apiFetch('/tasks/' + encodeSlug(slug) + '/logs', { method: 'POST', body: input });
  invalidate('tasks', 'task/' + slug, 'logs');
  return entry;
}

/**
 * @param {number} id
 * @param {LogInput} input
 * @returns {Promise<LogDTO>}
 */
export async function updateLog(id, input) {
  const entry = await apiFetch('/logs/' + id, { method: 'PUT', body: input });
  invalidate('tasks', 'logs');
  if (entry && entry.task_slug) invalidate('task/' + entry.task_slug);
  return entry;
}

/**
 * @param {number} id
 * @param {string} [taskSlug] invalidates that task's detail/logs when known
 */
export async function deleteLog(id, taskSlug) {
  await apiFetch('/logs/' + id, { method: 'DELETE' });
  invalidate('tasks', 'logs');
  if (taskSlug) invalidate('task/' + taskSlug);
}
