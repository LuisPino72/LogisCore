import { getDb } from '../dexie/db';
import type { SyncQueueItem, SyncOperationType } from './types';
import { MAX_RETRIES, BASE_BACKOFF_MS } from './types';

const TABLE_PRIORITY: Record<string, number> = {
  // Must be synced first: parent products, then child products
  products: 100,
  // Depends on products (via product_id and child_product_id FKs)
  product_presentations: 90,
  // Other core entities
  categories: 85,
  suppliers: 85,
  // Depends on products
  inventory_lots: 70,
  inventory_movements: 65,
  purchase_orders: 60,
  sales: 60,
  cash_registers: 60,
  sale_items: 50,
  purchase_order_items: 50,
  exchange_rates: 40,
};

export const syncQueue = {
  async enqueue(
    table: string,
    operation: SyncOperationType,
    recordId: string,
    payload: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    await db.syncQueue.add({
      table,
      operation,
      recordId,
      payload,
      tenantId,
      status: 'pending',
      retries: 0,
      lastError: null,
      nextRetryAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },

  async dequeue(batchSize: number): Promise<SyncQueueItem[]> {
    const db = getDb();
    const now = Date.now();

    const items = await db.syncQueue
      .where('status')
      .equals('pending')
      .and((item) => !item.nextRetryAt || item.nextRetryAt <= now)
      .limit(batchSize)
      .toArray();

    items.sort((a, b) => (TABLE_PRIORITY[b.table] ?? 0) - (TABLE_PRIORITY[a.table] ?? 0));

    const ids = items.map((i) => i.id!);
    await db.syncQueue.where('id').anyOf(ids).modify({ status: 'syncing' });

    return items;
  },

  async markSuccess(id: number): Promise<void> {
    const db = getDb();
    await db.syncQueue.delete(id);
  },

  async markFailed(id: number, error: string): Promise<void> {
    const db = getDb();
    const item = await db.syncQueue.get(id);
    if (!item) return;

    const retries = item.retries + 1;
    if (retries >= MAX_RETRIES) {
      await db.syncQueue.update(id, {
        status: 'failed',
        retries,
        lastError: error,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const backoff = BASE_BACKOFF_MS * Math.pow(2, retries) + Math.random() * 1000;
      await db.syncQueue.update(id, {
        status: 'pending',
        retries,
        lastError: error,
        nextRetryAt: Date.now() + backoff,
        updatedAt: new Date().toISOString(),
      });
    }
  },

  async getPendingCount(): Promise<number> {
    const db = getDb();
    return db.syncQueue.where('status').equals('pending').count();
  },

  async getFailedCount(): Promise<number> {
    const db = getDb();
    return db.syncQueue.where('status').equals('failed').count();
  },

  async getAllFailed(): Promise<SyncQueueItem[]> {
    const db = getDb();
    return db.syncQueue.where('status').equals('failed').toArray();
  },

  async retryFailed(id: number): Promise<void> {
    const db = getDb();
    await db.syncQueue.update(id, {
      status: 'pending',
      retries: 0,
      lastError: null,
      nextRetryAt: null,
      updatedAt: new Date().toISOString(),
    });
  },

  async clear(): Promise<void> {
    const db = getDb();
    await db.syncQueue.clear();
  },
};
