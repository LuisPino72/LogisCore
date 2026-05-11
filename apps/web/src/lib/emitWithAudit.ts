import { outboxService } from '@/services/outbox/outboxService';
import { isDbReady } from '@/services/dexie/db';
import { logAuditEvent } from './auditTrail';

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
  try {
    if (isDbReady()) {
      const enqueueResult = await outboxService.enqueue(eventName, module, payload);
      if (!enqueueResult.ok) {
        console.error(`[emitWithAudit] Outbox enqueue falló para ${eventName}:`, enqueueResult.error);
      }
    }

    await logAuditEvent({
      eventName,
      module,
      userId: context.userId,
      tenantId: context.tenantId,
      tenantUuid: context.tenantUuid,
      payload: (payload as Record<string, unknown>) ?? {},
    });
  } catch (err) {
    // Fallo silencioso: la auditoría es secundaria y no debe bloquear al usuario
    console.warn(`[emitWithAudit] Fallo no crítico en ${eventName}:`, err);
  }
}
