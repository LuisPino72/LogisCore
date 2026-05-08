import Dexie, { type Table } from 'dexie';
import type { TenantInfo } from '@logiscore/core';
import type { SyncQueueItem, SyncMeta } from '../sync/types';

export class LogisCoreDB extends Dexie {
  tenantRefs!: Table<TenantInfo, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  syncMeta!: Table<SyncMeta, string>;

  constructor(tenantSlug: string) {
    super(`LogisCore_${tenantSlug}`);
    this.version(2).stores({
      tenantRefs: 'id, slug, name',
      syncQueue: '++id, table, status, tenantId, nextRetryAt, createdAt, [tenantId+status]',
      syncMeta: 'table',
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
