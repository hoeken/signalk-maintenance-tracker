import { describe, it, expect } from 'vitest';
import { flattenPaths } from '../../public/app/api/signalkPaths.js';

describe('flattenPaths (§8.4)', () => {
  it('flattens numeric leaves to dotted paths', () => {
    const snapshot = {
      uuid: 'urn:mrn:signalk:uuid:x',
      name: 'Vessel',
      propulsion: {
        port: {
          runTime: { value: 4896000, timestamp: '2026-07-08T00:00:00Z', $source: 'n2k' },
          temperature: { value: 358, timestamp: '2026-07-08T00:00:00Z' },
        },
      },
      navigation: {
        position: { value: { latitude: 1, longitude: 2 }, timestamp: '2026-07-08T00:00:00Z' },
        speedOverGround: { value: null, timestamp: '2026-07-08T00:00:00Z' },
      },
    };
    const paths = flattenPaths(snapshot);
    expect(paths).toContain('propulsion.port.runTime');
    expect(paths).toContain('propulsion.port.temperature');
    // null values are still candidates (no reading yet)
    expect(paths).toContain('navigation.speedOverGround');
    // object-valued leaves are not runtime candidates
    expect(paths).not.toContain('navigation.position');
    // identity strings are not paths
    expect(paths.some((p) => p.indexOf('uuid') !== -1)).toBe(false);
  });

  it('returns sorted output and tolerates junk', () => {
    expect(flattenPaths(null)).toEqual([]);
    expect(flattenPaths({ a: { b: { value: 2 } }, c: { value: 1 } })).toEqual(['a.b', 'c']);
  });
});
