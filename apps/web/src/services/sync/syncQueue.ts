import { getDb } from '../dexie/db';
import type { SyncQueueItem, SyncOperationType } from './types';
import { MAX_RETRIES, BASE_BACKOFF_MS } from './types';

const TABLE_PRIORITY: Record<string, number> = {
  // Dependencies: categories → products → movements → lots
  categories: 100,
  products: 90,
  recipes: 88,
  recipe_lines: 87,
  product_presentations: 85,
  suppliers: 80,
  inventory_movements: 75,
  inventory_lots: 70,
  purchase_orders: 65,
  cash_registers: 65,
  production_orders: 62,
  sales: 60,
  sale_items: 55,
  purchase_order_items: 55,
  expenses: 50,
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

    // Deduplicar: si ya existe un item pending para el mismo recordId+table+operation, reemplazarlo
    const existing = await db.syncQueue
      .where('recordId')
      .equals(recordId)
      .and((item) => item.table === table && item.status === 'pending')
      .first();

    if (existing) {
      await db.syncQueue.update(existing.id!, {
        payload,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

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
      .toArray();

    items.sort((a, b) => (TABLE_PRIORITY[b.table] ?? 0) - (TABLE_PRIORITY[a.table] ?? 0));
    const sliced = items.slice(0, batchSize);

    const ids = sliced.map((i) => i.id!);
    await db.syncQueue.where('id').anyOf(ids).modify({ status: 'syncing' });

    return sliced;
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

  async getPendingRecordIds(): Promise<Set<string>> {
    const db = getDb();
    const pending = await db.syncQueue.where('status').equals('pending').toArray();
    return new Set(pending.map((item) => item.recordId));
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
