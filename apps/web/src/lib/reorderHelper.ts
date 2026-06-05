/**
 * DINERO-015 (F1): Helper para Reorder de productos sin stock en POS.
 * Construye URL para redirigir a Compras con producto pre-seleccionado.
 */

export const REORDER_QUERY_PARAM = 'preSelectProductId';

export function buildReorderUrl(productId: string, basePath: string = '/purchases'): string {
  const encoded = encodeURIComponent(productId);
  return `${basePath}?${REORDER_QUERY_PARAM}=${encoded}`;
}

export function parsePreSelectProductId(searchParams: URLSearchParams): string | null {
  return searchParams.get(REORDER_QUERY_PARAM);
}
