import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * List state (search, tags, sort, page…) lives in URL query params so views
 * are shareable/bookmarkable and survive refresh (§7.4). HashRouter keeps
 * these client-side only.
 */
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const get = useCallback(
    (key: string): string | undefined => searchParams.get(key) ?? undefined,
    [searchParams]
  );

  const getCsv = useCallback(
    (key: string): string[] => {
      const v = searchParams.get(key);
      return v ? v.split(',').filter(Boolean) : [];
    },
    [searchParams]
  );

  const getInt = useCallback(
    (key: string, fallback: number): number => {
      const v = Number.parseInt(searchParams.get(key) ?? '', 10);
      return Number.isFinite(v) && v > 0 ? v : fallback;
    },
    [searchParams]
  );

  /** Set params; empty values delete the key. Changing a filter resets page. */
  const update = useCallback(
    (values: Record<string, string | string[] | number | undefined>, resetPage = true) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(values)) {
            const str = Array.isArray(value) ? value.join(',') : value?.toString() ?? '';
            if (str) next.set(key, str);
            else next.delete(key);
          }
          if (resetPage && !('page' in values)) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return { get, getCsv, getInt, update };
}
