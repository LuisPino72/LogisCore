import { EventBus } from '@logiscore/core';
import { logAuditEvent } from './auditService';
import { outboxService } from '../outbox/outboxService';

let auditFailureCount = 0;
let lastFailureAlert = 0;
const AUDIT_FAILURE_THRESHOLD = 5;
const AUDIT_ALERT_COOLDOWN_MS = 60_000;

/** Emite un evento de sistema sin persistencia outbox/auditoría.
 *  Usar solo para eventos internos del engine (SYNC, CORE) que no son
 *  operaciones de escritura de negocio. */
export function emitEngineEvent(eventName: string, payload: unknown = {}): void {
  EventBus.emit(eventName, payload);
}

/** Emite un evento con feedback UI inmediato + registro de auditoría.
 *  NOTA: El encolado en outbox se realiza DENTRO de la transacción Dexie
 *  (ver outboxService.enqueue() en los servicios) para garantizar atomicidad
 *  (Regla #17). Esta función solo emite para UI y registra auditoría no crítica. */
export async function emitWithAudit(
  eventName: string,
  module: string,
  payload: unknown,
  context: {
    userId?: string;
    tenantId?: string;
    tenantUuid?: string | null;
  },
): Promise<void> {
  // 1. Emitir inmediatamente para feedback de UI (sincrónico)
  EventBus.emit(eventName, payload);

  // 2. Registrar en auditoría
  try {
    await logAuditEvent({
      eventName,
      module,
      userId: context.userId,
      tenantId: context.tenantId,
      tenantUuid: context.tenantUuid,
      payload: (payload as Record<string, unknown>) ?? {},
    });
    auditFailureCount = 0;
  } catch (err) {
    auditFailureCount++;
    console.warn(`[emitWithAudit] Fallo en ${eventName} (${auditFailureCount}/${AUDIT_FAILURE_THRESHOLD}):`, err);

    if (auditFailureCount >= AUDIT_FAILURE_THRESHOLD && Date.now() - lastFailureAlert > AUDIT_ALERT_COOLDOWN_MS) {
      lastFailureAlert = Date.now();
      auditFailureCount = 0;
      EventBus.emit('AUDIT.FAILED', { module, reason: String(err), consecutiveFailures: AUDIT_FAILURE_THRESHOLD });
    }
  }
}

/** Versión unificada que empareja outbox + audit.
 *  Retorna { enqueueInTransaction, auditAfterTransaction }
 *  para usar dentro/fuera de la transacción Dexie respectivamente.
 *  Uso:
 *    const ev = emitWithPersistence('SALE.C', 'POS', {...}, {...});
 *    await db.transaction(... async () => { await ev.enqueueInTransaction(); });
 *    await ev.auditAfterTransaction();
 */
export function emitWithPersistence(
  eventName: string,
  module: string,
  payload: unknown,
  context: {
    userId?: string;
    tenantId?: string;
    tenantUuid?: string | null;
  },
) {
  return {
    enqueueInTransaction: () => outboxService.enqueue(eventName, module, payload),
    auditAfterTransaction: () => emitWithAudit(eventName, module, payload, context),
  };
}
