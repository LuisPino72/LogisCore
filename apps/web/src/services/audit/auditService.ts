import { supabase } from '../supabase/client';
import { getDb, isDbReady } from '../dexie/db';

export const CRITICAL_EVENTS = [
  'SALE.COMPLETED',
  'SALE.VOIDED',
  'INVOICE.ISSUED',
  'INVOICE.VOIDED',
  'BOX.OPENED',
  'BOX.CLOSED',
  'INVENTORY.ADJUSTMENT',
  'USER.LOGIN',
  'USER.LOGOUT',
] as const;

export function sanitizePayload(payload: Record<string, unknown> = {}): Record<string, unknown> {
  const blocked = new Set(['password', 'token', 'authorization', 'creditCard', 'cvv']);
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!blocked.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function determineSeverity(eventName: string): string {
  if (['SALE.VOIDED', 'INVOICE.VOIDED'].includes(eventName)) return 'WARNING';
  return 'INFO';
}

export async function logAuditEvent(payload: {
  eventName: string;
  module: string;
  userId?: string;
  tenantId?: string;
  tenantUuid?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!CRITICAL_EVENTS.includes(payload.eventName as typeof CRITICAL_EVENTS[number])) {
    return;
  }

  const insertPayload: Record<string, unknown> = {
    event_name: payload.eventName,
    event_module: payload.module,
    severity: determineSeverity(payload.eventName),
    payload: sanitizePayload(payload.payload ?? {}),
  };

  if (payload.userId) insertPayload.user_id = payload.userId;
  if (payload.tenantUuid) insertPayload.tenant_id = payload.tenantUuid;

  if (!navigator.onLine) {
    return queueAuditLocally(insertPayload);
  }

  const { error } = await supabase.from('audit_trail').insert(insertPayload);
  if (error) {
    console.warn(`[auditService] Audit insert falló para ${payload.eventName}:`, error.message);
    if (error.message?.includes('network') || error.message?.includes('fetch')) {
      return queueAuditLocally(insertPayload);
    }
  }
}

async function queueAuditLocally(insertPayload: Record<string, unknown>): Promise<void> {
  if (!isDbReady()) return;
  try {
    const db = getDb();
    await db.auditEntries.add({
      eventName: insertPayload.event_name as string,
      module: insertPayload.event_module as string,
      userId: insertPayload.user_id as string | undefined,
      tenantId: insertPayload.tenant_id as string | undefined,
      payload: JSON.stringify(insertPayload.payload || {}),
      severity: insertPayload.severity as string,
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    });
  } catch (err) {
    console.warn('[auditService] Error al encolar auditoría local:', err);
  }
}

export async function flushPendingAudits(): Promise<void> {
  if (!navigator.onLine || !isDbReady()) return;
  try {
    const db = getDb();
    const pending = await db.auditEntries
      .where({ status: 'pending' })
      .limit(50)
      .toArray();

    for (const entry of pending) {
      const { error } = await supabase.from('audit_trail').insert({
        event_name: entry.eventName,
        event_module: entry.module,
        severity: entry.severity,
        payload: entry.payload ? JSON.parse(entry.payload) : {},
        user_id: entry.userId || undefined,
        tenant_id: entry.tenantId || undefined,
      });

      if (error) {
        await db.auditEntries.update(entry.id!, {
          retryCount: entry.retryCount + 1,
          error: error.message,
        });
      } else {
        await db.auditEntries.update(entry.id!, { status: 'synced' });
      }
    }
  } catch (err) {
    console.warn('[auditService] Error flushing audits:', err);
  }
}
