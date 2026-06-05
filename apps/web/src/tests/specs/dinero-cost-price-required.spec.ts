import { describe, expect, it } from 'vitest';
import { CreateProductInputSchema } from '../../specs/inventory';

describe('DINERO-004 (C4): costPrice=0 se rechaza (error duro, no warning)', () => {
  it('Given: costPrice=0. When: validar CreateProductInputSchema. Then: lanza error', () => {
    const result = CreateProductInputSchema.safeParse({
      name: 'Coca Cola',
      sku: 'CC-001',
      priceUsd: 1.5,
      isWeighted: false,
      isTaxable: true,
      isSellable: true,
      unit: 'unidad',
      categoryId: '00000000-0000-0000-0000-000000000000',
      categoryId: '00000000-0000-0000-0000-000000000000',
      costPrice: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const costError = result.error.issues.find((i) => i.path.includes('costPrice'));
      expect(costError).toBeDefined();
      expect(costError?.message).toContain('mayor a 0');
    }
  });

  it('Given: costPrice=-5. When: validar. Then: lanza error (negativo)', () => {
    const result = CreateProductInputSchema.safeParse({
      name: 'Test',
      sku: 'T-001',
      priceUsd: 1.5,
      isWeighted: false,
      isTaxable: true,
      isSellable: true,
      unit: 'unidad',
      categoryId: '00000000-0000-0000-0000-000000000000',
      categoryId: '00000000-0000-0000-0000-000000000000',
      costPrice: -5,
    });
    expect(result.success).toBe(false);
  });

  it('Given: costPrice=0.5. When: validar. Then: pasa (>= 0.01)', () => {
    const result = CreateProductInputSchema.safeParse({
      name: 'Test',
      sku: 'T-002',
      priceUsd: 1.5,
      isWeighted: false,
      isTaxable: true,
      isSellable: true,
      unit: 'unidad',
      categoryId: '00000000-0000-0000-0000-000000000000',
      categoryId: '00000000-0000-0000-0000-000000000000',
      costPrice: 0.5,
    });
    if (!result.success) console.error('Test 3 issues:', JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });

  it('Given: costPrice undefined. When: validar. Then: pasa (opcional)', () => {
    const result = CreateProductInputSchema.safeParse({
      name: 'Test',
      sku: 'T-003',
      priceUsd: 1.5,
      isWeighted: false,
      isTaxable: true,
      isSellable: true,
      unit: 'unidad',
      categoryId: '00000000-0000-0000-0000-000000000000',
      categoryId: '00000000-0000-0000-0000-000000000000',
    });
    expect(result.success).toBe(true);
  });
});
