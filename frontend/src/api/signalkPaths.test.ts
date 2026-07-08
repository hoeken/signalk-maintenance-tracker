import { describe, expect, it } from 'vitest';
import { flattenPaths } from './signalkPaths';

describe('flattenPaths (§8.4)', () => {
  it('flattens a vessels/self snapshot into dotted leaf paths', () => {
    const doc = {
      name: 'SV Test', // plain string, not a leaf object — skipped
      propulsion: {
        port: {
          runTime: { value: 4896000, timestamp: 't', $source: 's' },
          revolutions: { value: 20.5, timestamp: 't' },
        },
      },
      environment: {
        wind: { speedApparent: { value: 5.1 } },
      },
    };
    const paths = flattenPaths(doc);
    expect(paths).toContain('propulsion.port.runTime');
    expect(paths).toContain('propulsion.port.revolutions');
    expect(paths).toContain('environment.wind.speedApparent');
    expect(paths).not.toContain('name');
  });

  it('skips metadata keys', () => {
    const doc = {
      a: {
        meta: { units: 's' },
        b: { value: 1, $source: 'x', values: { src: { value: 2 } } },
      },
    };
    expect(flattenPaths(doc)).toEqual(['a.b']);
  });

  it('handles empty/odd input', () => {
    expect(flattenPaths(null)).toEqual([]);
    expect(flattenPaths([])).toEqual([]);
    expect(flattenPaths({})).toEqual([]);
  });
});
