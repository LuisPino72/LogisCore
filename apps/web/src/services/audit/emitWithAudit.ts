import type { Table } from 'dexie';
import { EventBus, SystemEvents } from '@logiscore/core';
import type { OutboxEntry } from '@logiscore/core';
import { logAuditEvent } from './auditService';
import { outboxService } from '../outbox/outboxService';

/** Campos requeridos por evento para validación de integridad */
const REQUIRED_FIELDS: Partial<Record<string, string[]>> = {
  [SystemEvents.SALE_COMPLETED]: ['saleId'],
  [SystemEvents.BOX_OPENED]: ['registerId'],
  [SystemEvents.BOX_CLOSED]: ['registerId'],
  [SystemEvents.SYNC_REFRESH_TABLE]: ['table'],
};

/**
 * Valida que los campos requeridos existan en el payload.
 * Retorna null si es válido, o un string con el error.
 */
function validateEventPayload(eventName: string, payload: unknown): string | null {
  const required = REQUIRED_FIELDS[eventName];
  if (!required) return null; // Sin validación para este evento

  if (!payload || typeof payload !== 'object') {
    return `Payload inválido para evento ${eventName}`;
  }

  const obj = payload as Record<string, unknown>;
  for (const field of required) {
    if (obj[field] === undefined || obj[field] === null) {
      return `Campo requerido "${field}" faltante en evento ${eventName}`;
    }
  }
  return null;
}

type OutboxTxScope = { outbox: Table<OutboxEntry, number> };

let auditFailureCount = 0;
let lastFailureAlert = 0;
const AUDIT_FAILURE_THRESHOLD = 5;
const AUDIT_ALERT_COOLDOWN_MS = 60_000;

/** Emite un evento de sistema sin persistencia outbox/auditoría.
 *  Usar solo para eventos internos del engine (SYNC, CORE) que no son
 *  operaciones de escritura de negocio. */
export function emitEngineEvent(eventName: string, payload: unknown = {}): void {
  const validationError = validateEventPayload(eventName, payload);
  if (validationError) {
    console.error(`[EventBus] ${validationError}`);
    return; // No emite eventos con payload inválido
  }
  EventBus.emit(eventName, payload);
}

export interface EmitAuditParams {
  eventName: string;
  module: string;
  payload: unknown;
  context: {
    userId?: string;
    tenantId?: string;
    tenantUuid?: string | null;
  };
}

/** Registra SOLO un evento en la tabla de auditoría (sin outbox).
 *  Usar cuando el evento ya fue encolizado vía outboxService.enqueue()
 *  dentro de una transacción Dexie previa, y solo se necesita el log
 *  de auditoría post-transacción. */
export async function logAuditEventOnly(params: EmitAuditParams): Promise<void> {
  const { eventName, module, payload, context } = params;
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
    console.warn(`[logAuditEventOnly] Fallo en ${eventName} (${auditFailureCount}/${AUDIT_FAILURE_THRESHOLD}):`, err);

    if (auditFailureCount >= AUDIT_FAILURE_THRESHOLD && Date.now() - lastFailureAlert > AUDIT_ALERT_COOLDOWN_MS) {
      lastFailureAlert = Date.now();
      auditFailureCount = 0;
      EventBus.emit('AUDIT.FAILED', { module, reason: String(err), consecutiveFailures: AUDIT_FAILURE_THRESHOLD });
    }
  }
}

/** Emite un evento con feedback UI inmediato + registro de auditoría.
 *  Encola al outbox (atómico si se pasa tx) y loguea en auditoría.
 *  Si la transacción ya enqueó el evento vía outboxService.enqueue(...,tx),
 *  usar logAuditEventOnly en su lugar para evitar duplicación. */
export async function emitWithAudit(
  params: EmitAuditParams,
  tx?: OutboxTxScope,
): Promise<void> {
  const { eventName, module, payload, context } = params;

  const validationError = validateEventPayload(eventName, payload);
  if (validationError) {
    console.error(`[EventBus] ${validationError}`);
    return; // No emite eventos con payload inválido
  }

  if (tx) {
    await outboxService.enqueueInTransaction(tx, eventName, module, payload);
  } else {
    await outboxService.enqueue(eventName, module, payload);
  }

  await logAuditEventOnly({ eventName, module, payload, context });
}

/** Versión unificada que empareja outbox + audit.
 *  Retorna { enqueueInTransaction, auditAfterTransaction }
 *  para usar dentro/fuera de la transacción Dexie respectivamente.
 *  Uso:
 *    const ev = emitWithPersistence('SALE.C', 'POS', {...}, {...});
 *    await db.transaction(... async (tx) => { await ev.enqueueInTransaction(tx); });
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
    enqueueInTransaction: (tx: OutboxTxScope) => outboxService.enqueueInTransaction(tx, eventName, module, payload),
    auditAfterTransaction: () => logAuditEventOnly({ eventName, module, payload, context }),
  };
}
