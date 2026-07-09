/**
 * Client-side mirror of the backend slugifier (src/domain/slug.ts) for the
 * live slug preview in the task form (§6.4). The server remains authoritative.
 * @param {string} input
 * @returns {string}
 */
export function slugify(input) {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics after decomposition
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'task';
}
