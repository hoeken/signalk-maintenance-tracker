import { describe, it, expect } from 'vitest';
import {
  parseHash,
  formatHash,
  matchPath,
} from '../../public/app/lib/router.js';

describe('parseHash', () => {
  it('parses empty hash as root', () => {
    expect(parseHash('')).toEqual({ path: '/', query: {} });
    expect(parseHash('#')).toEqual({ path: '/', query: {} });
    expect(parseHash('#/')).toEqual({ path: '/', query: {} });
  });

  it('parses path and query', () => {
    expect(parseHash('#/tasks/oil-change?page=2&search=oil')).toEqual({
      path: '/tasks/oil-change',
      query: { page: '2', search: 'oil' },
    });
  });

  it('decodes query values', () => {
    expect(parseHash('#/?search=port%20engine').query.search).toBe(
      'port engine',
    );
  });
});

describe('formatHash', () => {
  it('formats path only', () => {
    expect(formatHash('/log')).toBe('#/log');
  });

  it('drops empty/undefined params', () => {
    expect(formatHash('/', { search: '', page: undefined, tags: 'a,b' })).toBe(
      '#/?tags=a%2Cb',
    );
  });

  it('round-trips through parseHash', () => {
    const hash = formatHash('/tasks/x', { search: 'port engine', page: 3 });
    expect(parseHash(hash)).toEqual({
      path: '/tasks/x',
      query: { search: 'port engine', page: '3' },
    });
  });
});

describe('matchPath', () => {
  it('matches static paths', () => {
    expect(matchPath('/log', '/log')).toEqual({});
    expect(matchPath('/log', '/nope')).toBeNull();
  });

  it('extracts params', () => {
    expect(matchPath('/tasks/:slug', '/tasks/oil-change')).toEqual({
      slug: 'oil-change',
    });
  });

  it('decodes param values', () => {
    expect(matchPath('/tasks/:slug', '/tasks/a%20b')).toEqual({ slug: 'a b' });
  });

  it('rejects length mismatches', () => {
    expect(matchPath('/tasks/:slug', '/tasks')).toBeNull();
    expect(matchPath('/tasks/:slug', '/tasks/a/b')).toBeNull();
  });
});
