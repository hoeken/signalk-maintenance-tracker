export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics after decomposition
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'task';
}

/**
 * Make `base` unique by appending -2, -3, … until `exists` returns false.
 */
export function uniqueSlug(
  base: string,
  exists: (slug: string) => boolean,
): string {
  if (!exists(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!exists(candidate)) return candidate;
  }
}
