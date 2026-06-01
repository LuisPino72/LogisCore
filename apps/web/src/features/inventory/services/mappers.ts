import type { Product, Category, InventoryMovement, Presentation } from '../types';

export function toNumber(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

export function toProduct(raw: Record<string, unknown>): Product {
  return {
    id: raw.id as string,
    name: raw.name as string,
    sku: raw.sku as string,
    priceUsd: toNumber(raw.priceUsd),
    categoryId: raw.categoryId as string | undefined,
    isWeighted: raw.isWeighted as boolean,
    isTaxable: raw.isTaxable !== undefined ? !!raw.isTaxable : true,
    isSellable: raw.isSellable !== undefined ? !!raw.isSellable : true,
    unit: raw.unit as Product['unit'],
    stock: toNumber(raw.stock),
    stockMin: raw.stockMin != null ? toNumber(raw.stockMin) : undefined,
    imageUrl: (raw.imageUrl as string | undefined) ?? undefined,
    costPrice: raw.costPrice != null ? toNumber(raw.costPrice) : undefined,
    deletedAt: raw.deletedAt as string | undefined,
  };
}

export function toCategory(raw: Record<string, unknown>): Category {
  return {
    id: raw.id as string,
    name: raw.name as string,
    isPredefined: raw.isPredefined as boolean | undefined,
  };
}

export function toMovement(raw: Record<string, unknown>): InventoryMovement {
  return {
    id: raw.id as string,
    tenantId: raw.tenantId as string,
    productId: raw.productId as string,
    type: raw.type as InventoryMovement['type'],
    quantity: raw.quantity as number,
    previousStock: raw.previousStock as number,
    newStock: raw.newStock as number,
    createdAt: raw.createdAt as string,
    userId: raw.userId as string,
    reason: raw.reason as string | undefined,
    reasonType: raw.reasonType as string | undefined,
    costUsd: raw.costUsd as number | undefined,
  };
}

export function toPresentation(raw: Record<string, unknown>): Presentation {
  return {
    id: raw.id as string,
    productId: raw.productId as string,
    name: raw.name as string,
    priceUsd: raw.priceUsd as number,
    unitMultiplier: raw.unitMultiplier as number,
    stockType: 'shared',
    barcode: raw.barcode as string | undefined,
    sortOrder: raw.sortOrder as number,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: raw.deletedAt as string | undefined,
  };
}
