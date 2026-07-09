import { describe, it, expect } from 'vitest';
import { slugify } from '../../public/app/lib/slug.js';

// Mirrors the backend slugifier (src/domain/slug.ts) — same cases.
describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Engine Oil Change')).toBe('engine-oil-change');
  });

  it('collapses repeats and trims hyphens', () => {
    expect(slugify('  Winch -- service!  ')).toBe('winch-service');
  });

  it('strips diacritics', () => {
    expect(slugify('Água médio')).toBe('agua-medio');
  });

  it('falls back to "task" when nothing survives', () => {
    expect(slugify('!!!')).toBe('task');
  });
});
