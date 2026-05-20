import { AppError, failure, success, type Result } from '@logiscore/core';
import { emitEngineEvent } from '../audit/emitWithAudit';
import { flushPendingAudits } from '../audit/auditService';
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

// Tablas que se sincronizan bidireccionalmente (pull + push)
// Cada entrada define qué columna usar para incremental fetch
const PULL_TABLES: { name: string; timeCol: string }[] = [
  { name: 'products', timeCol: 'updated_at' },
  { name: 'categories', timeCol: 'updated_at' },
  { name: 'inventory_lots', timeCol: 'updated_at' },
  { name: 'suppliers', timeCol: 'updated_at' },
  { name: 'purchase_orders', timeCol: 'updated_at' },
];

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
    if (!navigator.onLine) return success({ pushed: 0, failed: 0, conflicts: 0, errors: [] });
    this.isSyncing = true;

    const result: SyncBatchResult = { pushed: 0, failed: 0, conflicts: 0, errors: [] };
    const MAX_BATCHES = 50;

    try {
      emitEngineEvent('SYNC.BATCH_STARTED', { batchSize });

      let batches = 0;
      while (batches < MAX_BATCHES) {
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
        batches++;
      }

      emitEngineEvent('SYNC.BATCH_COMPLETED', result);
      return success(result);
    } catch (err) {
      const appErr = err instanceof AppError ? err : new AppError('SYNC_BATCH_FAILED', 'Error en lote de sincronización');
      emitEngineEvent('SYNC.ERROR', appErr);
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
      case 'CREATE': {
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
          const { error } = await supabase.from(item.table).upsert(resolved);
          if (error) throw new AppError('SYNC_PUSH_FAILED', error.message, { details: { table: item.table, recordId: item.recordId } });
          emitEngineEvent('SYNC.CONFLICT_DETECTED', { table: item.table, recordId: item.recordId });
        } else {
          const { error } = await supabase.from(item.table).upsert(remotePayload);
          if (error) throw new AppError('SYNC_PUSH_FAILED', error.message, { details: { table: item.table, recordId: item.recordId } });
        }
        break;
      }

      case 'UPDATE': {
        const { error } = await supabase
          .from(item.table)
          .update(remotePayload)
          .eq(cfg.remoteIdField, remotePayload[cfg.remoteIdField]);
        if (error) {
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
            const { error: upsertError } = await supabase.from(item.table).upsert(resolved);
            if (upsertError) throw new AppError('SYNC_PUSH_FAILED', upsertError.message, { details: { table: item.table, recordId: item.recordId } });
            emitEngineEvent('SYNC.CONFLICT_DETECTED', { table: item.table, recordId: item.recordId });
          } else if (error.message) {
            throw new AppError('SYNC_PUSH_FAILED', error.message, { details: { table: item.table, recordId: item.recordId } });
          }
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
    if (!navigator.onLine) return success({ pushed: 0, failed: 0, conflicts: 0, errors: [] });
    const result: SyncBatchResult = { pushed: 0, failed: 0, conflicts: 0, errors: [] };
    const db = getDb();

    const tablesToSync = tables ?? PULL_TABLES.map((t) => t.name);

    for (const tableName of tablesToSync) {
      try {
        const tableCfg = PULL_TABLES.find((t) => t.name === tableName);
        const timeCol = tableCfg?.timeCol ?? 'updated_at';

        const meta = await db.syncMeta.get(tableName);
        const lastPullAt = meta?.lastPullAt ?? 0;

        const since = new Date(lastPullAt).toISOString();
        const query = supabase
          .from(tableName)
          .select('*')
          .or(`${timeCol}.gt.${since},deleted_at.gt.${since}`);

        const { data, error } = await query;

        if (error) {
          // Si no soporta OR (ej. columna deleted_at no existe), intentar solo timeCol
          if (error.message?.includes('deleted_at')) {
            const simpleQuery = supabase
              .from(tableName)
              .select('*')
              .gt(timeCol, since);
            const simpleResult = await simpleQuery;
            if (simpleResult.error) {
              if (timeCol === 'updated_at' && simpleResult.error.message?.includes(timeCol)) {
                const fallbackQuery = supabase
                  .from(tableName)
                  .select('*')
                  .gt('created_at', since);
                const fbResult = await fallbackQuery;
                if (fbResult.error) continue;
                const fbData = fbResult.data;
                if (fbData && fbData.length > 0) {
                  for (const record of fbData) {
                    await this.upsertLocalRecord(tableName, record);
                    result.pushed++;
                  }
                }
              }
              continue;
            }
            if (simpleResult.data && simpleResult.data.length > 0) {
              for (const record of simpleResult.data) {
                await this.upsertLocalRecord(tableName, record);
                result.pushed++;
              }
            }
          } else {
            continue;
          }
        } else {
          if (data && data.length > 0) {
            for (const record of data) {
              await this.upsertLocalRecord(tableName, record);
              result.pushed++;
            }
          }
        }

        await db.syncMeta.put({ table: tableName, lastPullAt: Date.now() });
        emitEngineEvent('SYNC.REFRESH_TABLE', { table: tableName });
      } catch (err) {
        if (err instanceof AppError) {
          result.errors.push(err);
          result.failed++;
        }
      }
    }

    return success(result);
  }

  private async upsertLocalRecord(tableName: string, record: Record<string, unknown>): Promise<void> {
    const db = getDb();
    const local: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      local[camel] = val;
    }
    // Asegurar tenantId en todas las tablas multi-tenant
    if (local.tenantId || record.tenant_id) {
      local.tenantId ??= record.tenant_id;
    }
    await db.table(tableName).put(local);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.pull().catch(() => {});
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

      if (navigator.onLine) {
        await flushPendingAudits();
      }

      this.scheduleNext();
    }, SYNC_INTERVAL_MS);
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}

export const syncEngine = new SyncEngine();
