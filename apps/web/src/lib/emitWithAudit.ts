import { outboxService } from '@/services/outbox/outboxService';
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
  const enqueueResult = await outboxService.enqueue(eventName, module, payload);
  if (!enqueueResult.ok) {
    console.error(`[emitWithAudit] Outbox enqueue falló para ${eventName}:`, enqueueResult.error);
  }

  logAuditEvent({
    eventName,
    module,
    userId: context.userId,
    tenantId: context.tenantId,
    tenantUuid: context.tenantUuid,
    payload: (payload as Record<string, unknown>) ?? {},
  }).catch((err) => {
    console.error(`[emitWithAudit] Audit trail falló para ${eventName}:`, err);
  });
}
