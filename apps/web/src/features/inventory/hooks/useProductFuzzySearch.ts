import { useMemo } from 'react';
import Fuse from 'fuse.js';
import type { Product } from '../types';

export function useProductFuzzySearch(
  products: Product[],
  query: string,
): Product[] {
  const fuse = useMemo(
    () =>
      new Fuse(products, {
        keys: ['name', 'sku'],
        threshold: 0.4,
        minMatchCharLength: 2,
        includeScore: false,
      }),
    [products],
  );

  return useMemo(() => {
    if (!query || query.trim().length < 2) return products;
    return fuse.search(query).map((r) => r.item);
  }, [fuse, query, products]);
}