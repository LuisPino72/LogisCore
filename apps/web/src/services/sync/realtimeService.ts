import { supabase } from '../supabase/client';
import { emitEngineEvent } from '../audit/emitWithAudit';
import { isDbClosing } from '../dexie/db';
import { useAuthStore } from '../../features/auth/stores/authStore';
import { logger } from '../../lib/logger';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type RecordPayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

export type RealtimeTable =
  | 'sales'
  | 'sale_items'
  | 'cash_registers'
  | 'products'
  | 'inventory_lots'
  | 'inventory_movements'
  | 'product_presentations'
  | 'categories'
  | 'suppliers'
  | 'customers'
  | 'purchase_orders'
  | 'purchase_order_items'
  | 'recipes'
  | 'recipe_lines'
  | 'production_orders'
  | 'expenses'
  | 'tenant_settings'
  | 'registers_config';

export const REALTIME_TABLES: RealtimeTable[] = [
  'sales',
  'sale_items',
  'cash_registers',
  'products',
  'inventory_lots',
  'inventory_movements',
  'product_presentations',
  'categories',
  'suppliers',
  'customers',
  'purchase_orders',
  'purchase_order_items',
  'recipes',
  'recipe_lines',
  'production_orders',
  'expenses',
  'tenant_settings',
  'registers_config',
];

export type RealtimeCallback = (tableName: string, record: Record<string, unknown>) => Promise<void>;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

class RealtimeService {
  private channel: RealtimeChannel | null = null;
  private connected = false;
  private onRecord: RealtimeCallback | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  start(onRecord: RealtimeCallback): void {
    if (this.running) return;
    this.running = true;
    this.onRecord = onRecord;
    this.connect();
  }

  private connect(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    queueMicrotask(() => {
      if (!this.running) return;
      this.createChannel();
    });
  }

  private createChannel(): void {
    this.channel = supabase
      .channel('logiscore-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: '*' },
        (payload: RecordPayload) => this.handleChange(payload),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          this.reconnectAttempt = 0;
          emitEngineEvent('SYNC.REALTIME_CONNECTED');
        } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.connected = false;
          logger.debug('[Realtime]', `Conexión perdida: ${status} (intento ${this.reconnectAttempt})`);
          emitEngineEvent('SYNC.REALTIME_DISCONNECTED');
          this.scheduleReconnect();
        }
      });
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    if (this.reconnectTimer) return;

    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt), RECONNECT_MAX_MS);
    this.reconnectAttempt++;

    logger.debug('[Realtime]', `Reconexión programada en ${delay}ms (intento ${this.reconnectAttempt})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.running) {
        this.connect();
      }
    }, delay);
  }

  private async handleChange(payload: RecordPayload): Promise<void> {
    if (isDbClosing()) return;
    if (!this.onRecord) return;

    const table = payload.table as string;

    if (!REALTIME_TABLES.includes(table as RealtimeTable)) return;

    try {
      const currentTenantUuid = useAuthStore.getState().session?.tenantId ?? null;

      if (payload.eventType === 'DELETE') {
        const oldRecord = payload.old as Record<string, unknown>;
        if (oldRecord && oldRecord.id) {
          if (currentTenantUuid && oldRecord.tenant_id && oldRecord.tenant_id !== currentTenantUuid) return;
          await this.onRecord(table, { ...oldRecord, deletedAt: new Date().toISOString() });
        }
      } else {
        const record = payload.new as Record<string, unknown>;
        if (record) {
          if (currentTenantUuid && record.tenant_id && record.tenant_id !== currentTenantUuid) return;
          await this.onRecord(table, record);
        }
      }
    } catch (err) {
      logger.debug('[Realtime]', `Error procesando cambio en ${table}`, String(err));
    }
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
      this.connected = false;
      this.onRecord = null;
      logger.debug('[Realtime]', 'Conexión WebSocket cerrada');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const realtimeService = new RealtimeService();
