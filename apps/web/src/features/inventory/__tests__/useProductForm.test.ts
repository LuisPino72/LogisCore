/**
 * Inventory Product Form Tests — PRODUCTION-003 [Paso-1]
 * TDD: Inventario solo permite materia_prima y resale
 *
 * Escenarios BDD (specs.md):
 *   1.1. Crear producto materia prima desde Inventario
 *   1.2. NO se puede crear producto_terminado desde Inventario
 */
import { describe, it, expect } from 'vitest';
import {
  InventoryProductTypeEnum,
  CreateProductInputSchema,
  ProductSchema,
} from '../../../specs/inventory';

describe('PRODUCTION-003 [Paso-1] Inventario: solo materia_prima y resale', () => {
  describe('InventoryProductTypeEnum (Esquema Zod)', () => {
    it('1.2 acepta productType "materia_prima" (materia prima)', () => {
      expect(InventoryProductTypeEnum.parse('materia_prima')).toBe('materia_prima');
    });

    it('1.2 acepta productType "resale" (reventa)', () => {
      expect(InventoryProductTypeEnum.parse('resale')).toBe('resale');
    });

    it('1.2 rechaza productType "producto_terminado" — NO se permite desde Inventario', () => {
      expect(() => InventoryProductTypeEnum.parse('producto_terminado')).toThrow();
    });

    it('1.2 rechaza productType "both" — NO se permite desde Inventario', () => {
      expect(() => InventoryProductTypeEnum.parse('both')).toThrow();
    });
  });

  describe('CreateProductInputSchema (Validación del Form)', () => {
    const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const baseInput = {
      name: 'Harina',
      sku: 'HAR-001',
      priceUsd: 2.5,
      categoryId: VALID_UUID,
      isWeighted: true,
      isTaxable: true,
      isSellable: true,
      unit: 'kg' as const,
      costPrice: 50,
    };

    it('1.1 acepta un producto materia_prima con costPrice y stock válidos', () => {
      const result = CreateProductInputSchema.safeParse({
        ...baseInput,
        productType: 'materia_prima',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.productType).toBe('materia_prima');
        expect(result.data.costPrice).toBe(50);
      }
    });

    it('1.1 acepta un producto sin productType (default = "resale")', () => {
      const result = CreateProductInputSchema.safeParse(baseInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.productType).toBe('resale');
      }
    });

    it('1.2 rechaza un producto con productType "producto_terminado"', () => {
      const result = CreateProductInputSchema.safeParse({
        ...baseInput,
        productType: 'producto_terminado',
      });
      expect(result.success).toBe(false);
    });

    it('1.2 rechaza un producto con productType "both"', () => {
      const result = CreateProductInputSchema.safeParse({
        ...baseInput,
        productType: 'both',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ProductSchema (Persistencia de la entidad Product en DB)', () => {
    const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const baseProduct = {
      id: VALID_UUID,
      name: 'Harina',
      sku: 'HAR-001',
      priceUsd: 2.5,
      categoryId: VALID_UUID,
      isWeighted: true,
      isTaxable: true,
      isSellable: true,
      unit: 'kg' as const,
      stock: 25000,
      costPrice: 2,
    };

    it('1.1 valida un producto materia_prima persistible (stock 25kg = 25000g, costPrice unitario $2/kg)', () => {
      const result = ProductSchema.safeParse({
        ...baseProduct,
        productType: 'materia_prima',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stock).toBe(25000);
        expect(result.data.costPrice).toBe(2);
        expect(result.data.productType).toBe('materia_prima');
      }
    });

    it('NOTA: ProductSchema acepta los 4 valores porque Producción crea producto_terminado y both (entidad DB, no form input)', () => {
      const resultTerminado = ProductSchema.safeParse({ ...baseProduct, id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', productType: 'producto_terminado' });
      const resultBoth = ProductSchema.safeParse({ ...baseProduct, id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', productType: 'both' });
      expect(resultTerminado.success).toBe(true);
      expect(resultBoth.success).toBe(true);
    });
  });
});
