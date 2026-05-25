import { useMemo } from 'react';
import Fuse from 'fuse.js';

interface FuzzySearchOptions<T> {
  keys: (keyof T)[];
  threshold?: number;
  minMatchCharLength?: number;
}

export function useFuzzySearch<T>(
  data: T[],
  query: string,
  options: FuzzySearchOptions<T>,
): T[] {
  const fuse = useMemo(
    () =>
      new Fuse(data, {
        keys: options.keys as string[],
        threshold: options.threshold ?? 0.4,
        minMatchCharLength: options.minMatchCharLength ?? 2,
        includeScore: false,
      }),
    [data, options.keys, options.threshold, options.minMatchCharLength],
  );

  return useMemo(() => {
    if (!query || query.trim().length < 2) return data;
    const results = fuse.search(query);
    return results.map((r) => r.item);
  }, [fuse, query, data]);
}