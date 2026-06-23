import { AppError } from '@logiscore/core';
import type { SyncConflict } from './types';

export enum ConflictResolutionStrategy {
  LWW = 'LWW',
  REMOTE_WINS = 'REMOTE_WINS',
  MANUAL = 'MANUAL',
  MERGE_PRODUCTS = 'MERGE_PRODUCTS',
  MERGE_INVENTORY_LOTS = 'MERGE_INVENTORY_LOTS',
  MERGE_SALE_ITEMS = 'MERGE_SALE_ITEMS',
}

const TABLE_STRATEGY: Record<string, ConflictResolutionStrategy> = {
  products: ConflictResolutionStrategy.MERGE_PRODUCTS,
  inventoryLots: ConflictResolutionStrategy.MERGE_INVENTORY_LOTS,
  saleItems: ConflictResolutionStrategy.MERGE_SALE_ITEMS,
  sales: ConflictResolutionStrategy.REMOTE_WINS,
};

export function resolveConflict(conflict: SyncConflict): Record<string, unknown> {
  const strategy = TABLE_STRATEGY[conflict.table] || ConflictResolutionStrategy.LWW;
  switch (strategy) {
    case ConflictResolutionStrategy.MERGE_PRODUCTS:
      return mergeProduct(conflict);
    case ConflictResolutionStrategy.MERGE_INVENTORY_LOTS:
      return mergeInventoryLot(conflict);
    case ConflictResolutionStrategy.MERGE_SALE_ITEMS:
      return mergeSaleItems(conflict);
    case ConflictResolutionStrategy.REMOTE_WINS:
      return { ...conflict.remotePayload };
    case ConflictResolutionStrategy.MANUAL:
      throw new AppError(
        'SYNC_MANUAL_RESOLUTION_REQUIRED',
        `Conflicto en ${conflict.table}/${conflict.recordId} requiere resolución manual`,
        { details: { conflict } },
      );
    default:
      return resolveLWW(conflict);
  }
}

function resolveLWW(conflict: SyncConflict): Record<string, unknown> {
  const localUpdated = conflict.localPayload.updatedAt as string | undefined;
  const remoteUpdated = conflict.remotePayload.updatedAt as string | undefined;

  if (!remoteUpdated) return { ...conflict.localPayload };
  if (!localUpdated) return { ...conflict.remotePayload };

  return localUpdated >= remoteUpdated
    ? { ...conflict.localPayload }
    : { ...conflict.remotePayload };
}

function mergeProduct(conflict: SyncConflict): Record<string, unknown> {
  const local = conflict.localPayload;
  const remote = conflict.remotePayload;
  const winner = resolveLWW(conflict);

  const nonConflicting = ['name', 'sku', 'categoryId', 'description', 'imageUrl',
    'isWeighted', 'unit', 'presentation', 'productType', 'isActive', 'isVisible'];
  for (const key of nonConflicting) {
    if (remote[key] !== undefined && local[key] !== undefined) {
      (winner as any)[key] = (winner as any)[key] ?? local[key];
    }
  }

  const localStock = typeof local.stock === 'number' ? local.stock : 0;
  const remoteStock = typeof remote.stock === 'number' ? remote.stock : 0;
  winner.stock = Math.max(localStock, remoteStock);

  return winner;
}

function mergeInventoryLot(conflict: SyncConflict): Record<string, unknown> {
  const local = conflict.localPayload;
  const remote = conflict.remotePayload;
  const winner = resolveLWW(conflict);

  const localQty = typeof local.remainingQuantity === 'number' ? local.remainingQuantity : 0;
  const remoteQty = typeof remote.remainingQuantity === 'number' ? remote.remainingQuantity : 0;
  winner.remainingQuantity = Math.min(localQty, remoteQty);

  return winner;
}

function mergeSaleItems(conflict: SyncConflict): Record<string, unknown> {
  const local = conflict.localPayload;
  const remote = conflict.remotePayload;

  const localItems = Array.isArray(local.items) ? local.items : [];
  const remoteItems = Array.isArray(remote.items) ? remote.items : [];

  const itemsMap = new Map<string, Record<string, unknown>>();
  for (const item of [...localItems, ...remoteItems]) {
    const existing = itemsMap.get(item.id as string);
    if (!existing || (item.updatedAt as string || '') > (existing.updatedAt as string || '')) {
      itemsMap.set(item.id as string, item as Record<string, unknown>);
    }
  }

  const base = resolveLWW(conflict);
  return { ...base, items: Array.from(itemsMap.values()) };
}

export function detectConflict(local: Record<string, unknown>, remote: Record<string, unknown>): boolean {
  if (!remote) return false;
  const localUpdated = local.updatedAt as string | undefined;
  const remoteUpdated = remote.updatedAt as string | undefined;

  if (!localUpdated || !remoteUpdated) return false;
  return remoteUpdated > localUpdated;
}
