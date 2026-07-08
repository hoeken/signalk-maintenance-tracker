import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with dashes', () => {
    expect(slugify('Engine Oil Change')).toBe('engine-oil-change');
    expect(slugify('Winch #2 (Port)')).toBe('winch-2-port');
  });

  it('folds diacritics to ASCII', () => {
    expect(slugify('Crème Brûlée Machine')).toBe('creme-brulee-machine');
  });

  it('collapses repeats and trims leading/trailing dashes', () => {
    expect(slugify('  --Fuel   Filter--  ')).toBe('fuel-filter');
  });

  it('falls back to "task" when nothing survives', () => {
    expect(slugify('***')).toBe('task');
    expect(slugify('')).toBe('task');
  });
});

describe('uniqueSlug', () => {
  it('returns the base when unused', () => {
    expect(uniqueSlug('oil-change', () => false)).toBe('oil-change');
  });

  it('appends -2, -3, … until free', () => {
    const taken = new Set(['oil-change', 'oil-change-2']);
    expect(uniqueSlug('oil-change', (s) => taken.has(s))).toBe('oil-change-3');
  });
});
