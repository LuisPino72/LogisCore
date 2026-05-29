import { supabase } from '../supabase/client';
import { emitEngineEvent } from '../audit/emitWithAudit';
import { isDbClosing } from '../dexie/db';
import { logger } from '../../lib/logger';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type RecordPayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

export type RealtimeTable =
  | 'products'
  | 'inventory_lots'
  | 'sales'
  | 'sale_items'
  | 'cash_registers'
  | 'expenses';

const REALTIME_TABLES: RealtimeTable[] = [
  'products',
  'inventory_lots',
  'sales',
  'sale_items',
  'cash_registers',
  'expenses',
];

export type RealtimeCallback = (tableName: string, record: Record<string, unknown>) => Promise<void>;

class RealtimeService {
  private channel: RealtimeChannel | null = null;
  private connected = false;
  private onRecord: RealtimeCallback | null = null;

  start(onRecord: RealtimeCallback): void {
    if (this.channel) return;
    this.onRecord = onRecord;

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
          logger.info('[Realtime]', 'Conexión WebSocket establecida');
          emitEngineEvent('SYNC.REALTIME_CONNECTED');
        } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.connected = false;
          logger.warn('[Realtime]', `Conexión perdida: ${status}`);
          emitEngineEvent('SYNC.REALTIME_DISCONNECTED');
        }
      });
  }

  private async handleChange(payload: RecordPayload): Promise<void> {
    if (isDbClosing()) return;
    if (!this.onRecord) return;

    const table = payload.table as string;

    if (!REALTIME_TABLES.includes(table as RealtimeTable)) return;

    try {
      if (payload.eventType === 'DELETE') {
        const oldRecord = payload.old as Record<string, unknown>;
        if (oldRecord && oldRecord.id) {
          await this.onRecord(table, { ...oldRecord, deletedAt: new Date().toISOString() });
        }
      } else {
        const record = payload.new as Record<string, unknown>;
        if (record) {
          await this.onRecord(table, record);
        }
      }
    } catch (err) {
      logger.error('[Realtime]', `Error procesando cambio en ${table}`, String(err));
    }
  }

  stop(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
      this.connected = false;
      this.onRecord = null;
      logger.info('[Realtime]', 'Conexión WebSocket cerrada');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const realtimeService = new RealtimeService();
