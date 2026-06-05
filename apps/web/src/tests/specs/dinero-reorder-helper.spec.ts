import { describe, expect, it } from 'vitest';
import { REORDER_QUERY_PARAM, buildReorderUrl, parsePreSelectProductId } from '../../lib/reorderHelper';

describe('DINERO-015 (F1): Reorder URL builder y parser', () => {
  it('Given: productId="prod-123". When: buildReorderUrl. Then: URL = "/purchases?preSelectProductId=prod-123"', () => {
    expect(buildReorderUrl('prod-123')).toBe('/purchases?preSelectProductId=prod-123');
  });

  it('Given: URL "/purchases?preSelectProductId=prod-X". When: parsePreSelectProductId. Then: retorna "prod-X"', () => {
    const params = new URLSearchParams('preSelectProductId=prod-X');
    expect(parsePreSelectProductId(params)).toBe('prod-X');
  });

  it('Given: URL sin param. When: parsePreSelectProductId. Then: retorna null', () => {
    const params = new URLSearchParams('other=value');
    expect(parsePreSelectProductId(params)).toBeNull();
  });

  it('Given: REORDER_QUERY_PARAM constante. Then: equals "preSelectProductId"', () => {
    expect(REORDER_QUERY_PARAM).toBe('preSelectProductId');
  });

  it('Given: productId con caracteres especiales. When: buildReorderUrl. Then: URL-encoded correctamente', () => {
    expect(buildReorderUrl('prod/with spaces')).toBe('/purchases?preSelectProductId=prod%2Fwith%20spaces');
  });
});
