// Mirror of the backend slugify (src/domain/slug.ts) for the live preview in
// the task form. The server re-normalizes on save, so drift is cosmetic only.
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'task';
}
