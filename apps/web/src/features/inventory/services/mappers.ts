import type { Product, Category, InventoryMovement, Presentation } from '../types';
import { ProductSchema, PresentationSchema, CategorySchema, InventoryMovementSchema } from '../../../specs/inventory';

export function toNumber(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

export function toProduct(raw: Record<string, unknown>): Product {
  return ProductSchema.parse(raw) as Product;
}

export function toCategory(raw: Record<string, unknown>): Category {
  return CategorySchema.parse(raw) as Category;
}

export function toMovement(raw: Record<string, unknown>): InventoryMovement {
  return InventoryMovementSchema.parse(raw) as InventoryMovement;
}

export function toPresentation(raw: Record<string, unknown>): Presentation {
  return PresentationSchema.parse(raw) as Presentation;
}
