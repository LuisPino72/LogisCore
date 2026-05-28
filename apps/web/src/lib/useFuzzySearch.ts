import { useMemo } from 'react';
import Fuse from 'fuse.js';

function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

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
        minMatchCharLength: options.minMatchCharLength ?? 1,
        includeScore: false,
        ignoreLocation: true,
      }),
    [data, options.keys, options.threshold, options.minMatchCharLength],
  );

  return useMemo(() => {
    if (!query || query.trim().length < 1) return data;
    const normalizedQuery = normalizeText(query);
    const results = fuse.search(normalizedQuery);
    return results.map((r) => r.item);
  }, [fuse, query, data]);
}
