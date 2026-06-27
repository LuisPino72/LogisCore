import { type Result, success, failure, AppError, SystemEvents } from '@logiscore/core';
import { getDb, type DexieDeliveryPerson } from '../../../services/dexie/db';
import { generateId, toSnake } from '@logiscore/shared';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useAuthStore } from '../../auth/stores/authStore';
import { logger } from '../../../lib/logger';

const MODULE_NAME = 'settings';

export async function getDeliveryPersons(tenantId: string): Promise<Result<DexieDeliveryPerson[], AppError>> {
  try {
    const db = getDb();
    const persons = await db.deliveryPersons
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => p.isActive && !p.deletedAt)
      .toArray();
    persons.sort((a, b) => a.name.localeCompare(b.name));
    return success(persons);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getDeliveryPersons:', err);
    return failure(new AppError('DELIVERY_PERSONS_FETCH_FAILED', 'Error al cargar motorizados.'));
  }
}

export async function addDeliveryPerson(data: {
  name: string;
  phone: string;
  tenantId: string;
  userId: string;
}): Promise<Result<DexieDeliveryPerson, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'settings', 'update')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }

  if (!data.name.trim()) {
    return failure(new AppError('DELIVERY_PERSON_NAME_REQUIRED', 'El nombre es obligatorio.'));
  }
  if (!data.phone.trim()) {
    return failure(new AppError('DELIVERY_PERSON_PHONE_REQUIRED', 'El teléfono es obligatorio.'));
  }

  try {
    const db = getDb();
    const now = new Date().toISOString();

    const existing = await db.deliveryPersons
      .where('tenantId')
      .equals(data.tenantId)
      .filter((p) => p.phone === data.phone.trim() && !p.deletedAt)
      .first();
    if (existing) {
      return failure(new AppError('DELIVERY_PERSON_PHONE_DUPLICATE', 'Ya existe un motorizado con ese teléfono.'));
    }

    const person: DexieDeliveryPerson = {
      id: generateId(),
      tenantId: data.tenantId,
      name: data.name.trim(),
      phone: data.phone.trim(),
      isActive: true,
      createdAt: now,
    };

    await db.transaction('rw', [db.deliveryPersons, db.syncQueue, db.outbox], async (tx) => {
      await db.deliveryPersons.add(person);
      await syncQueue.enqueue('delivery_persons', 'CREATE', person.id, toSnake(person as unknown as Record<string, unknown>), data.tenantId);
      await outboxService.enqueue(SystemEvents.SETTINGS_BUSINESS_UPDATED, MODULE_NAME, {
        action: 'delivery_person_added', personId: person.id,
      }, tx);
    });

    await logAuditEventOnly({
      eventName: SystemEvents.SETTINGS_BUSINESS_UPDATED,
      module: MODULE_NAME,
      payload: { action: 'delivery_person_added', personId: person.id, name: person.name },
      context: { userId: data.userId, tenantId: data.tenantId },
    });

    return success(person);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en addDeliveryPerson:', err);
    return failure(new AppError('DELIVERY_PERSON_CREATE_FAILED', 'Error al crear motorizado.'));
  }
}

export async function removeDeliveryPerson(
  id: string,
  tenantId: string,
  userId: string,
): Promise<Result<void, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'settings', 'update')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }

  try {
    const db = getDb();
    const existing = await db.deliveryPersons.get(id);
    if (!existing || existing.deletedAt || existing.tenantId !== tenantId) {
      return failure(new AppError('DELIVERY_PERSON_NOT_FOUND', 'Motorizado no encontrado.'));
    }

    const activeDispatched = await db.sales
      .where('tenantId')
      .equals(tenantId)
      .filter((s) =>
        !s.deletedAt &&
        s.status === 'despachada' &&
        s.deliveryPersonName === existing.name,
      )
      .count();

    if (activeDispatched > 0) {
      return failure(new AppError('DELIVERY_PERSON_HAS_ORDERS',
        `Este motorizado tiene ${activeDispatched} orden(es) despachada(s) pendiente(s). Re-asigna las órdenes antes de eliminar.`));
    }

    const now = new Date().toISOString();

    await db.transaction('rw', [db.deliveryPersons, db.syncQueue, db.outbox], async (tx) => {
      await db.deliveryPersons.update(id, { deletedAt: now, isActive: false });
      await syncQueue.enqueue('delivery_persons', 'UPDATE', id, toSnake({ id, deletedAt: now, isActive: false } as unknown as Record<string, unknown>), tenantId);
      await outboxService.enqueue(SystemEvents.SETTINGS_BUSINESS_UPDATED, MODULE_NAME, {
        action: 'delivery_person_removed', personId: id,
      }, tx);
    });

    await logAuditEventOnly({
      eventName: SystemEvents.SETTINGS_BUSINESS_UPDATED,
      module: MODULE_NAME,
      payload: { action: 'delivery_person_removed', personId: id },
      context: { userId, tenantId },
    });

    return success(undefined);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en removeDeliveryPerson:', err);
    return failure(new AppError('DELIVERY_PERSON_DELETE_FAILED', 'Error al eliminar motorizado.'));
  }
}

export async function updateDeliveryPerson(
  id: string,
  data: { name?: string; phone?: string },
  tenantId: string,
  userId: string,
): Promise<Result<DexieDeliveryPerson, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'settings', 'update')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }

  try {
    const db = getDb();
    const existing = await db.deliveryPersons.get(id);
    if (!existing || existing.deletedAt || existing.tenantId !== tenantId) {
      return failure(new AppError('DELIVERY_PERSON_NOT_FOUND', 'Motorizado no encontrado.'));
    }

    if (data.phone && data.phone.trim() !== existing.phone) {
      const duplicate = await db.deliveryPersons
        .where('tenantId')
        .equals(tenantId)
        .filter((p) => p.phone === data.phone!.trim() && p.id !== id && !p.deletedAt)
        .first();
      if (duplicate) {
        return failure(new AppError('DELIVERY_PERSON_PHONE_DUPLICATE', 'Ya existe un motorizado con ese teléfono.'));
      }
    }

    const updated: Partial<DexieDeliveryPerson> = {};
    if (data.name !== undefined) updated.name = data.name.trim();
    if (data.phone !== undefined) updated.phone = data.phone.trim();

    await db.transaction('rw', [db.deliveryPersons, db.syncQueue, db.outbox], async (tx) => {
      await db.deliveryPersons.update(id, updated);
      await syncQueue.enqueue('delivery_persons', 'UPDATE', id, toSnake({ id, ...updated } as unknown as Record<string, unknown>), tenantId);
      await outboxService.enqueue(SystemEvents.SETTINGS_BUSINESS_UPDATED, MODULE_NAME, {
        action: 'delivery_person_updated', personId: id, ...updated,
      }, tx);
    });

    logAuditEventOnly({
      eventName: SystemEvents.SETTINGS_BUSINESS_UPDATED,
      module: MODULE_NAME,
      payload: { action: 'delivery_person_updated', personId: id, ...updated },
      context: { userId, tenantId },
    }).catch((err) => logger.warn(MODULE_NAME, 'Audit falló (best-effort):', err));

    const result = await db.deliveryPersons.get(id);
    if (!result) {
      return failure(new AppError('DELIVERY_PERSON_NOT_FOUND', 'Motorizado no encontrado'));
    }
    return success(result);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en updateDeliveryPerson:', err);
    return failure(new AppError('DELIVERY_PERSON_UPDATE_FAILED', 'Error al actualizar motorizado.'));
  }
}

export async function getDeliveryPersonByPhone(
  tenantId: string,
  phone: string,
): Promise<Result<DexieDeliveryPerson | null, AppError>> {
  try {
    const db = getDb();
    const person = await db.deliveryPersons
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => p.phone === phone && p.isActive && !p.deletedAt)
      .first();
    return success(person ?? null);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getDeliveryPersonByPhone:', err);
    return failure(new AppError('DELIVERY_PERSON_FETCH_FAILED', 'Error al buscar motorizado.'));
  }
}
