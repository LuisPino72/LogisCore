import { AppError, failure, success, type Result } from '@logiscore/core';
import { emitEngineEvent } from '../audit/emitWithAudit';
import { flushPendingAudits } from '../audit/auditService';
import { supabase } from '../supabase/client';
import { TenantTranslator } from '../tenantTranslator';
import { getDb, isDbClosing, isDbReady } from '../dexie/db';
import { syncQueue } from './syncQueue';
import { detectConflict, resolveConflict } from './conflictResolver';
import { networkAware } from '../network/networkAwareService';
import { realtimeService } from './realtimeService';
import { useAuthStore } from '../../features/auth/stores/authStore';
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
  { name: 'customers', timeCol: 'updated_at' },
  { name: 'purchase_orders', timeCol: 'updated_at' },
  { name: 'cash_registers', timeCol: 'updated_at' },
  { name: 'sales', timeCol: 'updated_at' },
  { name: 'sale_items', timeCol: 'updated_at' },
  { name: 'purchase_order_items', timeCol: 'updated_at' },
  { name: 'inventory_movements', timeCol: 'created_at' },
  { name: 'product_presentations', timeCol: 'updated_at' },
  { name: 'expenses', timeCol: 'updated_at' },
  { name: 'recipes', timeCol: 'updated_at' },
  { name: 'recipe_lines', timeCol: 'created_at' },
  { name: 'production_orders', timeCol: 'updated_at' },
  { name: 'tenant_settings', timeCol: 'updated_at' },
  { name: 'registers_config', timeCol: 'updated_at' },
  { name: 'image_library', timeCol: 'updated_at' },
];

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

  private getCurrentTenantUuid(): string | null {
    const session = useAuthStore.getState().session;
    return session?.tenantId ?? null;
  }

  async push(batchSize = DEFAULT_BATCH_SIZE): Promise<Result<SyncBatchResult, AppError>> {
    if (this.isSyncing) return success({ pushed: 0, failed: 0, conflicts: 0, errors: [] });
    if (!navigator.onLine) return success({ pushed: 0, failed: 0, conflicts: 0, errors: [] });
    if (isDbClosing()) return success({ pushed: 0, failed: 0, conflicts: 0, errors: [] });
    this.isSyncing = true;

    const result: SyncBatchResult = { pushed: 0, failed: 0, conflicts: 0, errors: [] };
    const MAX_BATCHES = 50;

    try {
      let batches = 0;
      while (batches < MAX_BATCHES) {
        const items = await syncQueue.dequeue(batchSize);
        if (items.length === 0) break;

        for (const item of items) {
           try {
            await this.pushItem(item, result);
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

      return success(result);
    } catch (err) {
      const appErr = err instanceof AppError ? err : new AppError('SYNC_BATCH_FAILED', 'Error en lote de sincronización');
      return failure(appErr);
    } finally {
      this.isSyncing = false;
    }
  }

  private async pushItem(item: SyncQueueItem, result: SyncBatchResult): Promise<void> {
    const cfg = this.getConfig(item.table);
    const tenantUuid = await TenantTranslator.slugToUuid(item.tenantId);
    const remotePayload: Record<string, unknown> = { ...item.payload, tenant_id: tenantUuid };

    // Defense-in-depth: validar campos requeridos antes de upsert
    if (!remotePayload.tenant_id) {
      throw new AppError('SYNC_PUSH_FAILED', 'Campo requerido "tenant_id" faltante', {
        details: { table: item.table, recordId: item.recordId },
      });
    }
    const idField = cfg.remoteIdField;
    if (!remotePayload[idField]) {
      throw new AppError('SYNC_PUSH_FAILED', `Campo requerido "${idField}" faltante`, {
        details: { table: item.table, recordId: item.recordId },
      });
    }

    switch (item.operation) {
      case 'CREATE': {
        const { data: existing } = await supabase
          .from(item.table)
          .select('*')
          .eq(cfg.remoteIdField, remotePayload[cfg.remoteIdField])
          .eq('tenant_id', tenantUuid)
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
          resolved.tenant_id = tenantUuid;
           const { error } = await supabase.from(item.table).upsert(resolved);
           if (error) throw new AppError('SYNC_PUSH_FAILED', error.message, { details: { table: item.table, recordId: item.recordId } });
           result.conflicts++;
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
          .eq(cfg.remoteIdField, remotePayload[cfg.remoteIdField])
          .eq('tenant_id', tenantUuid);
        if (error) {
          const { data: existing } = await supabase
            .from(item.table)
            .select('*')
            .eq(cfg.remoteIdField, remotePayload[cfg.remoteIdField])
            .eq('tenant_id', tenantUuid)
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
            resolved.tenant_id = tenantUuid;
               const { error: upsertError } = await supabase.from(item.table).upsert(resolved);
               if (upsertError) throw new AppError('SYNC_PUSH_FAILED', upsertError.message, { details: { table: item.table, recordId: item.recordId } });
               result.conflicts++;
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
          .eq(cfg.remoteIdField, remotePayload[cfg.remoteIdField])
          .eq('tenant_id', tenantUuid);
        if (error) throw new AppError('SYNC_DELETE_FAILED', error.message);
        break;
      }
    }
  }

  /** Push inmediato (bajo demanda) — para operaciones críticas como completar una venta */
  async pushNow(batchSize = DEFAULT_BATCH_SIZE): Promise<Result<SyncBatchResult, AppError>> {
    return this.push(batchSize);
  }

  async pull(): Promise<Result<SyncBatchResult, AppError>> {
    if (!networkAware.isOnline() || isDbClosing()) return success({ pushed: 0, failed: 0, conflicts: 0, errors: [] });
    const result: SyncBatchResult = { pushed: 0, failed: 0, conflicts: 0, errors: [] };
    const db = getDb();
    const tablesToSync = PULL_TABLES.map((t) => t.name);
    let hasChanges = false;

    const tenantUuid = this.getCurrentTenantUuid();
    if (!tenantUuid) {
      logger.error('Sync', 'Pull abortado: no hay tenant UUID en sesión');
      return failure(new AppError('SYNC_PULL_FAILED', 'No hay tenant UUID disponible para pull'));
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
          .eq('tenant_id', tenantUuid)
          .or(`${timeCol}.gt.${since},deleted_at.gt.${since}`);

        const { data, error } = await query;

        if (isDbClosing()) break;

        if (error) {
          if (error.message?.includes('deleted_at')) {
            const simpleQuery = supabase
              .from(tableName)
              .select('*')
              .eq('tenant_id', tenantUuid)
              .gt(timeCol, since);
            const simpleResult = await simpleQuery;
            if (simpleResult.error) {
              if (timeCol === 'updated_at' && simpleResult.error.message?.includes(timeCol)) {
                const fallbackQuery = supabase
                  .from(tableName)
                  .select('*')
                  .eq('tenant_id', tenantUuid)
                  .gt('created_at', since);
                const fbResult = await fallbackQuery;
                if (fbResult.error) {
                  logger.error('Sync', `Pull fallback failed for ${tableName}: ${fbResult.error.message}`);
                  result.errors.push(new AppError('SYNC_PULL_FAILED', `Pull failed for ${tableName}: ${fbResult.error.message}`));
                  result.failed++;
                  continue;
                }
                const fbData = fbResult.data;
                if (fbData && fbData.length > 0) {
                  const pendingIds = await syncQueue.getPendingRecordIds();
                  for (const record of fbData) {
                    if (isDbClosing()) break;
                    await this.upsertLocalRecord(tableName, record, pendingIds);
                    result.pushed++;
                    hasChanges = true;
                  }
                }
              }
              continue;
            }
            if (simpleResult.data && simpleResult.data.length > 0) {
              const pendingIds = await syncQueue.getPendingRecordIds();
              for (const record of simpleResult.data) {
                if (isDbClosing()) break;
                await this.upsertLocalRecord(tableName, record, pendingIds);
                result.pushed++;
                hasChanges = true;
              }
            }
          } else {
            logger.error('Sync', `Pull failed for ${tableName}: ${error.message}`);
            result.errors.push(new AppError('SYNC_PULL_FAILED', `Pull failed for ${tableName}: ${error.message}`));
            result.failed++;
            continue;
          }
        } else {
          if (data && data.length > 0) {
            const pendingIds = await syncQueue.getPendingRecordIds();
            for (const record of data) {
              if (isDbClosing()) break;
              await this.upsertLocalRecord(tableName, record, pendingIds);
              result.pushed++;
              hasChanges = true;
            }
          }
        }

        if (isDbClosing()) break;

        await db.syncMeta.put({ table: tableName, lastPullAt: Date.now() });
        const eventName = `SYNC.REFRESH_${tableName.toUpperCase().replace(/-/g, '_')}`;
        emitEngineEvent(eventName, { table: tableName });
      } catch (err) {
        if (err instanceof AppError) {
          result.errors.push(err);
          result.failed++;
        }
      }
    }

    if (hasChanges) {
      emitEngineEvent('SYNC.REFRESH_TABLE', { table: '*' });
    }

    return success(result);
  }

  /** Maps remote (Supabase) table names to local (Dexie) table names when they differ */
  private readonly TABLE_ALIASES: Record<string, string> = {
    'registers_config': 'registerConfigs',
  };

  /** Tables where we should merge (not overwrite) on sync to avoid data loss */
  private readonly MERGE_TABLES = new Set(['tenantSettings']);

  private async upsertLocalRecord(tableName: string, record: Record<string, unknown>, pendingIds?: Set<string>): Promise<void> {
    if (isDbClosing()) return;
    const db = getDb();

    const currentTenantUuid = this.getCurrentTenantUuid();
    if (currentTenantUuid && record.tenant_id && record.tenant_id !== currentTenantUuid) {
      logger.warn('Sync', `Descartando registro de otro tenant: ${tableName}/${record.id} (tenant_id: ${record.tenant_id})`);
      return;
    }

    // Skip overwrite if there are pending local changes for this record in the sync queue
    // (e.g., soft delete or nextDueDate update not yet pushed to Supabase)
    const recordId = record.id as string | undefined;
    if (recordId && pendingIds) {
      if (pendingIds.has(recordId)) return;
    } else if (recordId) {
      const pendingCount = await db.syncQueue
        .filter((item) => item.recordId === recordId && item.status === 'pending')
        .count();
      if (pendingCount > 0) return;
    }

    const local: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (typeof val === 'string' && !isNaN(Number(val))) {
        local[camel] = parseFloat(val);
      } else {
        local[camel] = val;
      }
    }
    if (record.tenant_id) {
      const tid = record.tenant_id as string;
      local.tenantId = tid;
    }
    const dexieTable = this.TABLE_ALIASES[tableName] ?? tableName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (this.MERGE_TABLES.has(dexieTable)) {
      const existing = await db.table(dexieTable).get((local.tenantId ?? local.id) as string | number);
      if (existing) {
        for (const key of Object.keys(existing)) {
          if (!(key in local)) {
            local[key] = existing[key];
          }
        }
      }
    }
    await db.table(dexieTable).put(local);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.pull().catch(() => {});

    // Iniciar Supabase Realtime para push instantáneo (opcional - si falla, sync normal sigue)
    realtimeService.start(async (tableName, record) => {
      if (isDbClosing() || !isDbReady()) return;
      try {
        await this.upsertLocalRecord(tableName, record);
        const eventName = `SYNC.REFRESH_${tableName.toUpperCase().replace(/-/g, '_')}`;
        emitEngineEvent(eventName, { table: tableName });
        emitEngineEvent('SYNC.REFRESH_TABLE', { table: tableName });
      } catch (err) {
        logger.warn('[SyncEngine]', `Realtime upsert failed for ${tableName}, continuing with normal sync`, String(err));
      }
    });

    // Reaccionar a cambios de red: al reconectar, push + pull inmediatos
    let wasOnline = networkAware.isOnline();
    this.unsubscribeNetwork = networkAware.onChange((state) => {
      if (!wasOnline && state.online) {
        logger.debug('[SyncEngine]', 'Reconectado — ejecutando push + pull inmediatos');
        this.push().catch(() => {});
        this.pull().catch(() => {});
      }
      wasOnline = state.online;
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
    realtimeService.stop();
  }

  private scheduleNext(): void {
    if (!this.running || isDbClosing()) return;

    const interval = networkAware.getSyncInterval();

    this.syncTimer = setTimeout(async () => {
      if (!this.running || isDbClosing()) return;

      try {
        const pushResult = await this.push();
        if (pushResult.ok && this.running && !isDbClosing()) {
          await this.pull();
        }

        if (this.running && !isDbClosing() && networkAware.isOnline()) {
          await flushPendingAudits();
        }
      } catch {
        // DB cerrándose durante operación — ignorar silenciosamente
      }

      if (this.running && !isDbClosing()) {
        this.scheduleNext();
      }
    }, interval);
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}

export const syncEngine = new SyncEngine();
