import { supabase } from '@/services/supabase/client';

// ---------------------------------------------------------------------------
// Eventos críticos auditados
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
  if (payload.tenantId) insertPayload.tenant_id = payload.tenantId;
  if (payload.tenantUuid) insertPayload.tenant_uuid = payload.tenantUuid;

  await supabase.from('audit_trail').insert(insertPayload);
}
