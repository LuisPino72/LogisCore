import type { Product, Category, InventoryMovement, Presentation } from '../types';
import { ProductSchema, PresentationSchema, CategorySchema, InventoryMovementSchema } from '../../../specs/inventory';

export function toNumber(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function sanitizeNulls(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  if (out.sku == null || (typeof out.sku === 'string' && out.sku.trim() === '')) out.sku = 'SIN-SKU';
  if (out.categoryId == null) delete out.categoryId;
  if (out.stockMin == null) delete out.stockMin;
  if (out.imageUrl == null || (typeof out.imageUrl === 'number' && isNaN(out.imageUrl))) delete out.imageUrl;
  if (out.costPrice == null) delete out.costPrice;
  if (out.productType == null) delete out.productType;
  if (out.hasAssemblyRecipe == null) delete out.hasAssemblyRecipe;
  return out;
}

export function toProduct(raw: Record<string, unknown>): Product {
  return ProductSchema.parse(sanitizeNulls(raw)) as Product;
}

export function toCategory(raw: Record<string, unknown>): Category {
  return CategorySchema.parse(raw) as Category;
}

export function toMovement(raw: Record<string, unknown>): InventoryMovement {
  const normalized = { ...raw };
  if (typeof normalized.createdAt === 'string' && normalized.createdAt.includes(' ')) {
    normalized.createdAt = normalized.createdAt.replace(' ', 'T');
  }
  return InventoryMovementSchema.parse(normalized) as InventoryMovement;
}

export function toPresentation(raw: Record<string, unknown>): Presentation {
  return PresentationSchema.parse(raw) as Presentation;
}
