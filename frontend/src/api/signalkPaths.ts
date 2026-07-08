import { useQuery } from '@tanstack/react-query';

/**
 * Candidate runtime-path discovery (§8.4): fetch SignalK's own
 * /signalk/v1/api/vessels/self snapshot once per app session, flatten it into
 * a list of dotted path strings, and serve the autocomplete from that cached
 * list. Never re-fetched while typing; used only for path *names*, never for
 * runtime values.
 */
export function flattenPaths(node: unknown, prefix = '', out: string[] = []): string[] {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return out;
  const obj = node as Record<string, unknown>;

  // a SignalK leaf carries a `value` (and usually timestamp/$source)
  if ('value' in obj && prefix) {
    out.push(prefix);
    return out;
  }

  for (const [key, child] of Object.entries(obj)) {
    if (['meta', 'timestamp', '$source', 'source', 'values', 'pgn', 'sentence'].includes(key)) {
      continue;
    }
    flattenPaths(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

async function fetchSelfPaths(): Promise<string[]> {
  const res = await fetch('/signalk/v1/api/vessels/self', { credentials: 'same-origin' });
  if (!res.ok) return [];
  const doc = await res.json();
  const paths = flattenPaths(doc);
  // surface likely runtime paths first, then everything else alphabetically
  const isRuntime = (p: string) => /runtime/i.test(p);
  return [...new Set(paths)].sort(
    (a, b) => Number(isRuntime(b)) - Number(isRuntime(a)) || a.localeCompare(b)
  );
}

/**
 * Lazy by construction: the hook lives in the task-form modal, so the query
 * first runs when the editor opens; staleTime Infinity keeps it for the
 * whole session (§7.6).
 */
export function useSignalKPaths() {
  return useQuery({
    queryKey: ['skPaths'],
    queryFn: fetchSelfPaths,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
