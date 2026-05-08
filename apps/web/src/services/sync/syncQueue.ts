import { getDb } from '../dexie/db';
import type { SyncQueueItem, SyncOperationType } from './types';
import { MAX_RETRIES, BASE_BACKOFF_MS } from './types';

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
