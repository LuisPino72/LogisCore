import { supabase } from '../supabase/client';
import { getDb, isDbReady } from '../dexie/db';

// AUDIT-FLOW-1-001: Ampliar CRITICAL_EVENTS para cubrir TODAS las mutaciones de
// negocio. Antes solo 9 eventos eran auditados (~20%); ahora cubrimos el set
// completo de eventos de mutación de LogisCore. Decisión conservadora: lista
// explícita (no "todos") para evitar inflado de tabla por eventos internos.
export const CRITICAL_EVENTS = [
  'SALE.COMPLETED',
  'SALE.VOIDED',
  'INVOICE.ISSUED',
  'INVOICE.VOIDED',
  'BOX.OPENED',
  'BOX.CLOSED',
  'INVENTORY.ADJUSTMENT',
  'INVENTORY.CREATED',
  'INVENTORY.UPDATED',
  'INVENTORY.DELETED',
  'USER.LOGIN',
  'USER.LOGIN_FAILED',
  'USER.LOGOUT',
  // Purchases (7)
  'PURCHASE.SUPPLIER_CREATED',
  'PURCHASE.SUPPLIER_UPDATED',
  'PURCHASE.SUPPLIER_DELETED',
  'PURCHASE.CREATED',
  'PURCHASE.UPDATED',
  'PURCHASE.DELETED',
  'PURCHASE.CONFIRMED',
  'PURCHASE.RECEIVED',
  'PURCHASE.CANCELLED',
  // Expenses (5)
  'EXPENSES.CREATED',
  'EXPENSES.UPDATED',
  'EXPENSES.DELETED',
  'EXPENSES.RECURRING_GENERATED',
  'EXPENSES.CANCELLED',
  // Production (6)
  'PRODUCTION.CREATED',
  // PRODUCTION-003 [Paso-2]: nuevo nombre semántico (alias de PRODUCTION.CREATED)
  'PRODUCTION.RECIPE_CREATED',
  'PRODUCTION.UPDATED',
  'PRODUCTION.DELETED',
  'PRODUCTION.COMPLETED',
  'PRODUCTION.ORDER_CANCELLED',
  // PRODUCTION-003 [Paso-2]: producto auto-creado desde producción
  'INVENTORY.PRODUCT_CREATED',
  // Customers (3)
  'CUSTOMER.CREATED',
  'CUSTOMER.UPDATED',
  'CUSTOMER.DELETED',
  // Admin (3)
  'ADMIN.TENANT.CREATE',
  'ADMIN.TENANT.DELETE',
  'ADMIN.TENANT.HARD_DELETE',
  // Exchange (1)
  'EXCHANGE.RATE_UPDATED',
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
  if (['SALE.VOIDED', 'INVOICE.VOIDED'].includes(eventName)) return 'WARN';
  return 'INFO';
}

function ensureStringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value.toString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sanitizeInsertPayload(payload: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    sanitized[key] = ensureStringValue(value);
  }
  return sanitized;
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

  const safeInsertPayload = sanitizeInsertPayload(insertPayload);

  if (!navigator.onLine) {
    return queueAuditLocally(safeInsertPayload);
  }

  const { error } = await supabase.from('audit_trail').insert(safeInsertPayload);
  if (error) {
    console.warn(`[auditService] Audit insert falló para ${payload.eventName}:`, error.message);
    if (error.message?.includes('network') || error.message?.includes('fetch')) {
      return queueAuditLocally(safeInsertPayload);
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
      const flushPayload = {
        event_name: entry.eventName,
        event_module: entry.module,
        severity: entry.severity,
        payload: entry.payload ? JSON.parse(entry.payload) : {},
        user_id: entry.userId || undefined,
        tenant_id: entry.tenantId || undefined,
      };
      const safeFlushPayload = sanitizeInsertPayload(flushPayload);
      const { error } = await supabase.from('audit_trail').insert(safeFlushPayload);

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
