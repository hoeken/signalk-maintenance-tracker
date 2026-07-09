/**
 * Signal-backed toast queue (§7.2); rendered by <Toaster/> in the shell.
 */
import { signal } from '../../vendor/signals.js';

/** @typedef {{ id: number, message: string, kind: 'info'|'success'|'error' }} Toast */

let nextId = 1;

/** @type {import('../../vendor/signals.js').Signal<Toast[]>} */
export const toasts = signal([]);

/**
 * @param {string} message
 * @param {'info'|'success'|'error'} [kind]
 */
export function toast(message, kind) {
  const id = nextId++;
  toasts.value = toasts.value.concat([
    { id: id, message: message, kind: kind || 'info' },
  ]);
  setTimeout(function () {
    dismissToast(id);
  }, 5000);
  return id;
}

/** @param {number} id */
export function dismissToast(id) {
  toasts.value = toasts.value.filter(function (t) {
    return t.id !== id;
  });
}
