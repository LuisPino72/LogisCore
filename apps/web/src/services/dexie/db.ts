import Dexie, { type Table } from 'dexie';
import type { TenantInfo } from '@logiscore/core';
import type { SyncQueueItem, SyncMeta } from '../sync/types';
import type { OutboxEntry } from '@logiscore/core';

export class LogisCoreDB extends Dexie {
  tenantRefs!: Table<TenantInfo, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  syncMeta!: Table<SyncMeta, string>;
  outbox!: Table<OutboxEntry, number>;

  constructor(tenantSlug: string) {
    super(`LogisCore_${tenantSlug}`);
    this.version(3).stores({
      tenantRefs: 'id, slug, name',
      syncQueue: '++id, table, status, tenantId, nextRetryAt, createdAt, [tenantId+status]',
      syncMeta: 'table',
      outbox: '++id, event, status, createdAt, nextRetryAt, [status+nextRetryAt]',
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
