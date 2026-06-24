import type { Recipe, RecipeLine, ProductionOrder } from '../types';

export function recipeQtyToStorage(qty: number, recipeUnit: string, productUnit: string): number {
  if (productUnit === 'kg' && recipeUnit === 'g') return qty / 1000;
  if (productUnit === 'kg' && recipeUnit === 'kg') return qty * 1000;
  if (productUnit === 'lt' && recipeUnit === 'ml') return qty / 1000;
  if (productUnit === 'lt' && recipeUnit === 'lt') return qty * 1000;
  if (productUnit === 'unidad' && recipeUnit === 'unidad') return qty;
  if (productUnit === 'gr' && recipeUnit === 'g') return qty;
  if (productUnit === 'gr' && recipeUnit === 'kg') return qty * 1000;
  return qty;
}

export function recipeQtyToStorageBase(qty: number, recipeUnit: string, productUnit: string): number {
  if (productUnit === 'kg' && recipeUnit === 'g') return qty;
  if (productUnit === 'kg' && recipeUnit === 'kg') return qty * 1000;
  if (productUnit === 'lt' && recipeUnit === 'ml') return qty;
  if (productUnit === 'lt' && recipeUnit === 'lt') return qty * 1000;
  if (productUnit === 'unidad' && recipeUnit === 'unidad') return qty;
  if (productUnit === 'gr' && recipeUnit === 'g') return qty;
  if (productUnit === 'gr' && recipeUnit === 'kg') return qty * 1000;
  return qty;
}

export function toRecipe(raw: Record<string, unknown>): Recipe {
  return {
    id: raw.id as string,
    tenantId: raw.tenantId as string,
    name: raw.name as string,
    productId: raw.productId as string,
    mode: raw.mode as Recipe['mode'],
    yieldQuantity: raw.yieldQuantity as number,
    yieldUnit: raw.yieldUnit as string,
    wastePct: raw.wastePct as number,
    isActive: raw.isActive as boolean,
    notes: raw.notes as string | undefined,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: raw.deletedAt as string | undefined,
  };
}

export function toRecipeLine(raw: Record<string, unknown>): RecipeLine {
  return {
    id: raw.id as string,
    tenantId: raw.tenantId as string,
    recipeId: raw.recipeId as string,
    productId: raw.productId as string,
    quantity: raw.quantity as number,
    unit: raw.unit as string,
    sortOrder: raw.sortOrder as number,
    createdAt: raw.createdAt as string,
    deletedAt: raw.deletedAt as string | undefined,
  };
}

export function toProductionOrder(raw: Record<string, unknown>): ProductionOrder {
  return {
    id: raw.id as string,
    tenantId: raw.tenantId as string,
    recipeId: raw.recipeId as string,
    productId: raw.productId as string,
    batchCount: raw.batchCount as number,
    quantityTarget: raw.quantityTarget as number,
    quantityProduced: raw.quantityProduced as number,
    status: raw.status as ProductionOrder['status'],
    plannedDate: raw.plannedDate as string | undefined,
    startedAt: raw.startedAt as string | undefined,
    completedAt: raw.completedAt as string | undefined,
    wasteNotes: raw.wasteNotes as string | undefined,
    createdBy: raw.createdBy as string,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: raw.deletedAt as string | undefined,
    totalCost: raw.totalCost != null ? (raw.totalCost as number) : undefined,
    costPerUnit: raw.costPerUnit != null ? (raw.costPerUnit as number) : undefined,
  };
}
