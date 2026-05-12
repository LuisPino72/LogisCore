import Dexie, { type Table } from 'dexie';
import type { TenantInfo } from '@logiscore/core';
import type { SyncQueueItem, SyncMeta } from '../sync/types';
import type { OutboxEntry } from '@logiscore/core';

// Inventory types (inlined to avoid circular deps)

export interface DexieProduct {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  priceUsd: number;
  categoryId?: string;
  isWeighted: boolean;
  unit: 'kg' | 'gr' | 'lt' | 'm' | 'unidad';
  stock: number;
  stockMin?: number;
  deletedAt?: string;
}

export interface DexieCategory {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  deletedAt?: string;
}

export interface DexieInventoryMovement {
  id: string;
  tenantId: string;
  productId: string;
  userId: string;
  type: 'sale' | 'purchase' | 'adjustment';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  createdAt: string;
}

export interface DexieInventoryLot {
  id: string;
  tenantId: string;
  productId: string;
  quantityAdded: number;
  remainingQuantity: number;
  sourceMovementId?: string;
  createdAt: string;
}

export class LogisCoreDB extends Dexie {
  tenantRefs!: Table<TenantInfo, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  syncMeta!: Table<SyncMeta, string>;
  outbox!: Table<OutboxEntry, number>;
  products!: Table<DexieProduct, string>;
  categories!: Table<DexieCategory, string>;
  inventoryMovements!: Table<DexieInventoryMovement, string>;
  inventoryLots!: Table<DexieInventoryLot, string>;

  constructor(tenantSlug: string) {
    super(`LogisCore_${tenantSlug}`);
    this.version(4).stores({
      tenantRefs: 'id, slug, name',
      syncQueue: '++id, table, status, tenantId, nextRetryAt, createdAt, [tenantId+status]',
      syncMeta: 'table',
      outbox: '++id, event, status, createdAt, nextRetryAt, [status+nextRetryAt]',
      products: 'id, tenantId, sku, categoryId, name, [tenantId+deletedAt]',
      categories: 'id, tenantId, slug, [tenantId+deletedAt]',
      inventoryMovements: 'id, tenantId, productId, type, createdAt, [productId+createdAt]',
      inventoryLots: 'id, tenantId, productId, remainingQuantity, createdAt, [productId+remainingQuantity]',
    });
  }
}

let dbInstance: LogisCoreDB | null = null;

export function getDb(): LogisCoreDB {
  if (!dbInstance) {
    throw new Error('Dexie no inicializado. Llama a initDb(tenantSlug) primero.');
  }
  return dbInstance;
}

export function isDbReady(): boolean {
  return dbInstance !== null;
}

export function initDb(tenantSlug: string): LogisCoreDB {
  if (dbInstance && dbInstance.name === `LogisCore_${tenantSlug}`) {
    return dbInstance;
  }
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = new LogisCoreDB(tenantSlug);
  return dbInstance;
}

export function destroyDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
