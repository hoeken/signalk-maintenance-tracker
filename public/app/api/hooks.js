/**
 * Signals-backed resource hooks + mutations over the plugin REST API (§7.6).
 * Mutations invalidate the affected keys on success so the UI updates
 * immediately instead of waiting for the next poll.
 */
import { apiFetch, buildQuery, API_BASE, ApiError } from './client.js';
import { onUnauthorized } from '../auth/auth.js';
import { useResource, invalidate } from './resource.js';

/** @typedef {import('../types.js').TaskDTO} TaskDTO */
/** @typedef {import('../types.js').TaskFileDTO} TaskFileDTO */
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
  return useResource('tasks' + query, () => apiFetch('/tasks' + query), {
    refetchInterval: POLL_MS,
  });
}

/**
 * @param {string} slug
 * @returns {import('./resource.js').ResourceState<TaskDTO>}
 */
export function useTask(slug) {
  return useResource(
    'task/' + slug,
    () => apiFetch('/tasks/' + encodeSlug(slug)),
    {
      refetchInterval: POLL_MS,
    },
  );
}

/**
 * @param {string} slug
 * @returns {import('./resource.js').ResourceState<{data: LogDTO[]}>}
 */
export function useTaskLogs(slug) {
  return useResource(
    'task/' + slug + '/logs',
    () => apiFetch('/tasks/' + encodeSlug(slug) + '/logs'),
    {
      refetchInterval: POLL_MS,
    },
  );
}

/**
 * @param {Record<string, string|number|undefined|null>} [params]
 * @returns {import('./resource.js').ResourceState<import('../types.js').Page<LogDTO>>}
 */
export function useLogs(params) {
  const query = buildQuery(params);
  return useResource('logs' + query, () => apiFetch('/logs' + query), {
    refetchInterval: POLL_MS,
  });
}

/**
 * @returns {import('./resource.js').ResourceState<{data: TagDTO[]}>}
 */
export function useTags() {
  return useResource('tags', () => apiFetch('/tags'), {
    refetchInterval: POLL_MS,
  });
}

/**
 * Plugin health/version (§8.5). Fetched once; the version can't change
 * without a server restart, so no polling.
 * @returns {import('./resource.js').ResourceState<{ version: string, defaults: { runtime_warning_hours: number, time_warning_days: number } }>}
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
  const task = await apiFetch('/tasks/' + encodeSlug(slug), {
    method: 'PUT',
    body: input,
  });
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
  const entry = await apiFetch('/tasks/' + encodeSlug(slug) + '/logs', {
    method: 'POST',
    body: input,
  });
  invalidate('tasks', 'task/' + slug, 'logs');
  return entry;
}

/**
 * Standalone (non-task) log entry (§7.4): work worth recording that isn't
 * tied to any maintenance task — a title stands in for the task name.
 * @param {LogInput} input
 * @returns {Promise<LogDTO>}
 */
export async function addStandaloneLog(input) {
  const entry = await apiFetch('/logs', { method: 'POST', body: input });
  invalidate('logs');
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

// ---- task files (§8.6) ----

/**
 * Download URL for an attachment — served as an attachment under the
 * original filename by the plugin API.
 * @param {string} slug
 * @param {number} fileId
 */
export function taskFileUrl(slug, fileId) {
  return API_BASE + '/tasks/' + encodeSlug(slug) + '/files/' + fileId;
}

/**
 * Upload one attachment. The bytes go as the raw request body (always
 * octet-stream — a JSON content type would get the body parsed server-side)
 * with the name and real type in headers. XMLHttpRequest rather than fetch
 * so a multi-hundred-megabyte upload can report progress.
 * @param {string} slug
 * @param {File} file
 * @param {(fraction: number) => void} [onProgress] 0..1
 * @returns {Promise<TaskFileDTO>}
 */
export function uploadTaskFile(slug, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/tasks/' + encodeSlug(slug) + '/files');
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    if (file.type) xhr.setRequestHeader('X-File-Type', file.type);
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
      };
    }
    xhr.onerror = () => reject(new Error('Upload failed (network error)'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.onload = () => {
      if (xhr.status === 401 || xhr.status === 403) onUnauthorized();
      /** @type {any} */
      let body;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        invalidate('tasks', 'task/' + slug);
        resolve(body);
        return;
      }
      const errInfo = body && body.error ? body.error : {};
      reject(
        new ApiError(
          xhr.status,
          errInfo.code || 'http_' + xhr.status,
          errInfo.message || 'Upload failed (' + xhr.status + ')',
        ),
      );
    };
    xhr.send(file);
  });
}

/**
 * @param {string} slug
 * @param {number} fileId
 */
export async function deleteTaskFile(slug, fileId) {
  await apiFetch('/tasks/' + encodeSlug(slug) + '/files/' + fileId, {
    method: 'DELETE',
  });
  invalidate('tasks', 'task/' + slug);
}
