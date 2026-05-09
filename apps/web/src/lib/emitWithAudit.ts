import { EventBus } from '@logiscore/core';
import { logAuditEvent } from './auditTrail';

/**
 * Wrapper que emite un evento en el EventBus y registra en audit trail
 * Solo para eventos críticos. Si el evento no es crítico, se ignora.
 * 
 * Uso: Reemplazar `EventBus.emit('SALE.COMPLETED', payload)` por:
 *   emitWithAudit('SALE.COMPLETED', 'SALES', payload, { userId, tenantId, tenantUuid })
 * 
 * IMPORTANTE: Solo usar para eventos críticos (sale, invoice, inventory, auth).
 */
export async function emitWithAudit(
  eventName: string,
  module: string,
  payload: unknown,
  context: {
    userId?: string;
    tenantId: string;
    tenantUuid?: string;
  },
): Promise<void> {
  // 1. Registrar en audit trail (non-blocking)
  logAuditEvent({
    eventName,
    module,
    userId: context.userId,
    tenantId: context.tenantId,
    tenantUuid: context.tenantUuid,
    payload: payload as Record<string, unknown> ?? {},
  }).catch((err) => {
    console.error(`[emitWithAudit] Audit trail falló para ${eventName}:`, err);
  });

  // 2. Emitir evento (siempre se emite, incluso si el audit falla)
  EventBus.emit(eventName, payload);
}
