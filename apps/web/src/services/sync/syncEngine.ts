import { AppError, EventBus, failure, success, type Result } from '@logiscore/core';
import { supabase } from '../supabase/client';
import { TenantTranslator } from '../tenantTranslator';
import { getDb } from '../dexie/db';
import { syncQueue } from './syncQueue';
import { detectConflict, resolveConflict } from './conflictResolver';
import type {
  SyncQueueItem,
  SyncBatchResult,
  SyncTableConfig,
} from './types';
import { DEFAULT_BATCH_SIZE, SYNC_INTERVAL_MS } from './types';

const CATALOG_TABLES = ['tenantRefs'];

export class SyncEngine {
  private configs = new Map<string, SyncTableConfig>();
  private isSyncing = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  registerTable(config: SyncTableConfig): void {
    this.configs.set(config.name, config);
  }

  private getConfig(table: string): SyncTableConfig {
    const cfg = this.configs.get(table);
    if (cfg) return cfg;

    return {
      name: table,
      type: 'transactional',
      conflictStrategy: 'LWW',
      localIdField: 'id',
      remoteIdField: 'id',
    };
  }

  async push(batchSize = DEFAULT_BATCH_SIZE): Promise<Result<SyncBatchResult, AppError>> {
    if (this.isSyncing) return success({ pushed: 0, failed: 0, conflicts: 0, errors: [] });
    this.isSyncing = true;

    const result: SyncBatchResult = { pushed: 0, failed: 0, conflicts: 0, errors: [] };

    try {
      EventBus.emit('SYNC.BATCH_STARTED', { batchSize });

      while (true) {
        const items = await syncQueue.dequeue(batchSize);
        if (items.length === 0) break;

        for (const item of items) {
          try {
            await this.pushItem(item);
            await syncQueue.markSuccess(item.id!);
            result.pushed++;
          } catch (err) {
            const errorMessage = err instanceof AppError ? err.message : 'Error de sincronización';
            await syncQueue.markFailed(item.id!, errorMessage);
            result.failed++;

            if (err instanceof AppError) {
              result.errors.push(err);
            }
          }
        }
      }

      EventBus.emit('SYNC.BATCH_COMPLETED', result);
      return success(result);
    } catch (err) {
      const appErr = err instanceof AppError ? err : new AppError('SYNC_BATCH_FAILED', 'Error en lote de sincronización');
      EventBus.emit('SYNC.ERROR', appErr);
      return failure(appErr);
    } finally {
      this.isSyncing = false;
    }
  }

  private async pushItem(item: SyncQueueItem): Promise<void> {
    const cfg = this.getConfig(item.table);
    const tenantUuid = await TenantTranslator.slugToUuid(item.tenantId);
    const remotePayload: Record<string, unknown> = { ...item.payload, tenant_id: tenantUuid };

    switch (item.operation) {
      case 'CREATE':
      case 'UPDATE': {
        const { data: existing } = await supabase
          .from(item.table)
          .select('*')
          .eq(cfg.remoteIdField, remotePayload[cfg.remoteIdField])
          .maybeSingle();

        if (existing && detectConflict(item.payload, existing)) {
          const resolved = resolveConflict({
            queueItemId: item.id!,
            table: item.table,
            recordId: item.recordId,
            localPayload: item.payload,
            remotePayload: existing,
            strategy: cfg.conflictStrategy,
          });
          await supabase.from(item.table).upsert(resolved).maybeSingle();
          EventBus.emit('SYNC.CONFLICT_DETECTED', { table: item.table, recordId: item.recordId });
        } else {
          const { error } = await supabase.from(item.table).upsert(remotePayload).maybeSingle();
          if (error) throw new AppError('SYNC_PUSH_FAILED', error.message, { details: { table: item.table, recordId: item.recordId } });
        }
        break;
      }

      case 'DELETE': {
        const { error } = await supabase
          .from(item.table)
          .update({ deleted_at: new Date().toISOString() })
          .eq(cfg.remoteIdField, remotePayload[cfg.remoteIdField]);
        if (error) throw new AppError('SYNC_DELETE_FAILED', error.message);
        break;
      }
    }
  }

  async pull(tables?: string[]): Promise<Result<SyncBatchResult, AppError>> {
    const result: SyncBatchResult = { pushed: 0, failed: 0, conflicts: 0, errors: [] };
    const db = getDb();

    const tablesToSync = tables ?? CATALOG_TABLES;

    for (const tableName of tablesToSync) {
      try {
        const meta = await db.syncMeta.get(tableName);
        const lastPullAt = meta?.lastPullAt ?? 0;

        const query = supabase
          .from(tableName)
          .select('*')
          .gt('updated_at', new Date(lastPullAt).toISOString());

        const { data, error } = await query;

        if (error) {
          throw new AppError('SYNC_PULL_FAILED', error.message, { details: { table: tableName } });
        }

        if (data && data.length > 0) {
          for (const record of data) {
            await db.table(tableName).put(record);
            result.pushed++;
          }
        }

        await db.syncMeta.put({ table: tableName, lastPullAt: Date.now() });
      } catch (err) {
        if (err instanceof AppError) {
          result.errors.push(err);
          result.failed++;
        }
      }
    }

    return success(result);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private scheduleNext(): void {
    if (!this.running) return;

    this.syncTimer = setTimeout(async () => {
      if (!this.running) return;

      const pushResult = await this.push();
      if (pushResult.ok) {
        await this.pull();
      }

      this.scheduleNext();
    }, SYNC_INTERVAL_MS);
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}

export const syncEngine = new SyncEngine();

syncEngine.registerTable({
  name: 'tenantRefs',
  type: 'catalog',
  conflictStrategy: 'REMOTE_WINS',
  localIdField: 'slug',
  remoteIdField: 'id',
});
