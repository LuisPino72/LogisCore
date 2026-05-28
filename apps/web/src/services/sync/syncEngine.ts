import { AppError, failure, success, type Result } from '@logiscore/core';
import { emitEngineEvent } from '../audit/emitWithAudit';
import { flushPendingAudits } from '../audit/auditService';
import { supabase } from '../supabase/client';
import { TenantTranslator } from '../tenantTranslator';
import { getDb, isDbClosing } from '../dexie/db';
import { syncQueue } from './syncQueue';
import { detectConflict, resolveConflict } from './conflictResolver';
import { networkAware } from '../network/networkAwareService';
import { logger } from '../../lib/logger';
import type {
  SyncQueueItem,
  SyncBatchResult,
  SyncTableConfig,
} from './types';
import { DEFAULT_BATCH_SIZE } from './types';

// Tablas que se sincronizan bidireccionalmente (pull + push)
// Cada entrada define qué columna usar para incremental fetch
const PULL_TABLES: { name: string; timeCol: string }[] = [
  { name: 'products', timeCol: 'updated_at' },
  { name: 'categories', timeCol: 'updated_at' },
  { name: 'inventory_lots', timeCol: 'updated_at' },
  { name: 'suppliers', timeCol: 'updated_at' },
  { name: 'purchase_orders', timeCol: 'updated_at' },
  { name: 'cash_registers', timeCol: 'updated_at' },
  { name: 'sales', timeCol: 'updated_at' },
  { name: 'sale_items', timeCol: 'updated_at' },
  { name: 'purchase_order_items', timeCol: 'updated_at' },
  { name: 'product_presentations', timeCol: 'updated_at' },
];

// Tablas de catálogo que se omiten en pull cuando estamos en datos móviles
const CATALOG_TABLES = new Set(['products', 'categories', 'suppliers', 'purchase_orders', 'purchase_order_items', 'product_presentations']);

export class SyncEngine {
  private configs = new Map<string, SyncTableConfig>();
  private isSyncing = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private unsubscribeNetwork: (() => void) | null = null;

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
    if (isDbClosing()) return success({ pushed: 0, failed: 0, conflicts: 0, errors: [] });
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
            logger.error('Sync', `Error pushing ${item.table}/${item.operation}`, errorMessage, err);
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

  /** Push inmediato (bajo demanda) — para operaciones críticas como completar una venta */
  async pushNow(batchSize = DEFAULT_BATCH_SIZE): Promise<Result<SyncBatchResult, AppError>> {
    return this.push(batchSize);
  }

  async pull(tables?: string[]): Promise<Result<SyncBatchResult, AppError>> {
    if (!networkAware.isOnline()) return success({ pushed: 0, failed: 0, conflicts: 0, errors: [] });
    const result: SyncBatchResult = { pushed: 0, failed: 0, conflicts: 0, errors: [] };
    const db = getDb();

    if (isDbClosing()) return success(result);

    // En datos móviles, solo sincronizamos tablas transaccionales (no catálogo)
    // así protegemos los megas del plan del bodeguero
    let tablesToSync = tables ?? PULL_TABLES.map((t) => t.name);
    if (networkAware.isMobileData()) {
      tablesToSync = tablesToSync.filter((t) => !CATALOG_TABLES.has(t));
    }

    for (const tableName of tablesToSync) {
      if (isDbClosing()) break;

      try {
        const tableCfg = PULL_TABLES.find((t) => t.name === tableName);
        const timeCol = tableCfg?.timeCol ?? 'updated_at';

        const meta = await db.syncMeta.get(tableName);
        if (isDbClosing()) break;
        const lastPullAt = meta?.lastPullAt ?? 0;

        const since = new Date(lastPullAt).toISOString();
        const query = supabase
          .from(tableName)
          .select('*')
          .or(`${timeCol}.gt.${since},deleted_at.gt.${since}`);

        const { data, error } = await query;

        if (isDbClosing()) break;

        if (error) {
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
                    if (isDbClosing()) break;
                    await this.upsertLocalRecord(tableName, record);
                    result.pushed++;
                  }
                }
              }
              continue;
            }
            if (simpleResult.data && simpleResult.data.length > 0) {
              for (const record of simpleResult.data) {
                if (isDbClosing()) break;
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
              if (isDbClosing()) break;
              await this.upsertLocalRecord(tableName, record);
              result.pushed++;
            }
          }
        }

        if (isDbClosing()) break;

        await db.syncMeta.put({ table: tableName, lastPullAt: Date.now() });
        const eventName = `SYNC.REFRESH_${tableName.toUpperCase().replace(/-/g, '_')}`;
        emitEngineEvent(eventName, { table: tableName });
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
    if (isDbClosing()) return;
    const db = getDb();
    const local: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      local[camel] = val;
    }
    if (record.tenant_id) {
      const tid = record.tenant_id as string;
      local.tenantId = tid;
    }
    await db.table(tableName).put(local);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.pull().catch((err) => {
      logger.error('Sync', 'Initial pull failed during start', err);
    });

    // Reaccionar a cambios de red para re-sincronizar al recuperar WiFi
    this.unsubscribeNetwork = networkAware.onChange((state) => {
      if (state.online && !networkAware.isMobileData()) {
        // Al volver a WiFi, hacemos un pull completo para ponernos al día
        this.pull().catch(() => {});
      }
      // El scheduleNext() ya usa getSyncInterval() que se adapta automáticamente
    });

    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.unsubscribeNetwork) {
      this.unsubscribeNetwork();
      this.unsubscribeNetwork = null;
    }
  }

  private scheduleNext(): void {
    if (!this.running) return;

    const interval = networkAware.getSyncInterval();

    this.syncTimer = setTimeout(async () => {
      if (!this.running || isDbClosing()) return;

      const pushResult = await this.push();
      if (pushResult.ok) {
        await this.pull();
      }

      if (networkAware.isOnline()) {
        await flushPendingAudits();
      }

      this.scheduleNext();
    }, interval);
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}

export const syncEngine = new SyncEngine();
