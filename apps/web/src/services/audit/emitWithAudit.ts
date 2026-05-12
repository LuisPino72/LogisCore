import { EventBus } from '@logiscore/core';
import { outboxService } from '@/services/outbox/outboxService';
import { isDbReady } from '@/services/dexie/db';
import { logAuditEvent } from './auditService';

/** Emite un evento de sistema sin persistencia outbox/auditoría.
 *  Usar solo para eventos internos del engine (SYNC, CORE) que no son
 *  operaciones de escritura de negocio. */
export function emitEngineEvent(eventName: string, payload: unknown = {}): void {
  EventBus.emit(eventName, payload);
}

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

  try {
    // 2. Encolar en outbox para durabilidad transaccional (Regla #17)
    if (isDbReady()) {
      const enqueueResult = await outboxService.enqueue(eventName, module, payload);
      if (!enqueueResult.ok) {
        console.error(`[emitWithAudit] Outbox enqueue falló para ${eventName}:`, enqueueResult.error);
      }
    }

    // 3. Registrar en auditoría
    await logAuditEvent({
      eventName,
      module,
      userId: context.userId,
      tenantId: context.tenantId,
      tenantUuid: context.tenantUuid,
      payload: (payload as Record<string, unknown>) ?? {},
    });
  } catch (err) {
    console.warn(`[emitWithAudit] Fallo no crítico en ${eventName}:`, err);
  }
}
