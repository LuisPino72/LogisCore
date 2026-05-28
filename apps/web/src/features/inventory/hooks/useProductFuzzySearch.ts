import { useMemo } from 'react';
import Fuse from 'fuse.js';
import type { Product } from '../types';

function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function useProductFuzzySearch(
  products: Product[],
  query: string,
): Product[] {
  const fuse = useMemo(
    () =>
      new Fuse(products, {
        keys: ['name', 'sku'],
        threshold: 0.4,
        minMatchCharLength: 1,
        includeScore: false,
        ignoreLocation: true,
      }),
    [products],
  );

  return useMemo(() => {
    if (!query || query.trim().length < 1) return products;
    const normalizedQuery = normalizeText(query);
    return fuse.search(normalizedQuery).map((r) => r.item);
  }, [fuse, query, products]);
}
