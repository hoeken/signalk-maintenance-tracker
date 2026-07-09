/**
 * Thin fetch wrapper for the plugin REST API (§7.6). Prefixes the base path,
 * sends the same-origin session cookie, normalizes JSON + errors, and routes
 * 401/403 into the auth layer.
 */
import { onUnauthorized } from '../auth/auth.js';

export const API_BASE = '/plugins/signalk-maintenance-tracker/api';

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * @param {string} path e.g. '/tasks?page=1'
 * @param {{ method?: string, body?: unknown }} [options]
 * @returns {Promise<any>} parsed JSON body (null for 204)
 */
export async function apiFetch(path, options) {
  const opts = options || {};
  /** @type {RequestInit} */
  const init = { method: opts.method || 'GET', credentials: 'same-origin' };
  if (opts.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API_BASE + path, init);
  if (res.status === 401 || res.status === 403) onUnauthorized();
  const text = await res.text();
  /** @type {any} */
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (err) {
      body = null;
    }
  }
  if (!res.ok) {
    const errInfo = body && body.error ? body.error : {};
    throw new ApiError(
      res.status,
      errInfo.code || 'http_' + res.status,
      errInfo.message || 'Request failed (' + res.status + ')'
    );
  }
  return body;
}

/**
 * Build a query string from params, skipping empty values.
 * @param {Record<string, string|number|undefined|null>} [params]
 * @returns {string} '' or '?a=b&c=d'
 */
export function buildQuery(params) {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? '?' + qs : '';
}
