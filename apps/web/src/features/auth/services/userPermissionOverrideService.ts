import { type Result, success, failure, AppError, SystemEvents } from '@logiscore/core';
import { getDb, type DexieUserPermissionOverride } from '../../../services/dexie/db';
import { generateId, toSnake } from '@logiscore/shared';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { hasActionPermission } from '../permissions/rolePermissions';
import { getPermissionMessage } from '../permissions/messages';
import { useAuthStore } from '../stores/authStore';
import { logger } from '../../../lib/logger';
import type { CreateOverrideInput } from '../../../specs/roles';
import { getAllKnownPermissions } from '../../../specs/roles';

const MODULE_NAME = 'auth';

export async function getOverrides(userId: string): Promise<Result<DexieUserPermissionOverride[], AppError>> {
  try {
    const db = getDb();
    const session = useAuthStore.getState().session;
    const tenantId = session?.tenantId;
    if (!tenantId) {
      return failure(new AppError('AUTH_NO_TENANT', 'No hay tenant activo.'));
    }
    const overrides = await db.userPermissionOverrides
      .where('[userId+tenantId]')
      .equals([userId, tenantId])
      .filter((o) => !o.deletedAt)
      .toArray();
    return success(overrides);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getOverrides:', err);
    return failure(new AppError('OVERRIDES_FETCH_FAILED', 'Error al cargar permisos individuales.'));
  }
}

export async function addOverride(input: CreateOverrideInput): Promise<Result<DexieUserPermissionOverride, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'settings', 'manage')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', getPermissionMessage('settings', 'manage')));
  }

  if (input.tenantId !== session.tenantId) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No se pueden gestionar permisos de otro tenant.'));
  }

  const known = getAllKnownPermissions();
  if (!known.includes(input.permission)) {
    return failure(new AppError('INVALID_INPUT', 'Permiso no reconocido en el sistema.'));
  }

  try {
    const db = getDb();
    const now = new Date().toISOString();

    const result = await db.transaction('rw', [db.userPermissionOverrides, db.syncQueue, db.outbox], async (tx) => {
      const existing = await db.userPermissionOverrides
        .where('[userId+tenantId+permission]')
        .equals([input.userId, input.tenantId, input.permission])
        .first();
      if (existing && !existing.deletedAt) {
        if (existing.effect === input.effect) {
          return failure(new AppError('OVERRIDE_ALREADY_EXISTS', 'Este permiso ya tiene este efecto configurado.'));
        }
        await db.userPermissionOverrides.update(existing.id, { effect: input.effect });
        await syncQueue.enqueue('user_permission_overrides', 'UPDATE', existing.id, toSnake({ id: existing.id, effect: input.effect } as unknown as Record<string, unknown>), input.tenantId);
        await outboxService.enqueue(SystemEvents.SETTINGS_BUSINESS_UPDATED, MODULE_NAME, {
          action: 'override_updated', overrideId: existing.id, permission: input.permission, effect: input.effect,
        }, tx);

        const updated = await db.userPermissionOverrides.get(existing.id);
        if (!updated) {
          return failure(new AppError('OVERRIDE_NOT_FOUND', 'Permiso no encontrado después de actualizar.'));
        }
        return success(updated);
      }

      const override: DexieUserPermissionOverride = {
        id: generateId(),
        userId: input.userId,
        tenantId: input.tenantId,
        permission: input.permission,
        effect: input.effect,
        createdAt: now,
      };

      await db.userPermissionOverrides.add(override);
      await syncQueue.enqueue('user_permission_overrides', 'CREATE', override.id, toSnake(override as unknown as Record<string, unknown>), input.tenantId);
      await outboxService.enqueue(SystemEvents.SETTINGS_BUSINESS_UPDATED, MODULE_NAME, {
        action: 'override_added', overrideId: override.id, permission: input.permission, effect: input.effect,
      }, tx);

      return success(override);
    });

    if (result.ok) {
      await logAuditEventOnly({
        eventName: SystemEvents.SETTINGS_BUSINESS_UPDATED,
        module: MODULE_NAME,
        payload: { action: 'override_added', overrideId: result.data.id, userId: input.userId, permission: input.permission, effect: input.effect },
        context: { userId: session.userId, tenantId: input.tenantId },
      });
    }

    return result;
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en addOverride:', err);
    return failure(new AppError('OVERRIDE_CREATE_FAILED', 'Error al crear permiso individual.'));
  }
}

export async function removeOverride(id: string): Promise<Result<void, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'settings', 'manage')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', getPermissionMessage('settings', 'manage')));
  }

  try {
    const db = getDb();
    const existing = await db.userPermissionOverrides.get(id);
    if (!existing || existing.deletedAt) {
      return failure(new AppError('OVERRIDE_NOT_FOUND', 'Permiso no encontrado.'));
    }

    if (existing.tenantId !== session.tenantId) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tiene acceso a este registro.'));
    }

    const now = new Date().toISOString();

    await db.transaction('rw', [db.userPermissionOverrides, db.syncQueue, db.outbox], async (tx) => {
      await db.userPermissionOverrides.update(id, { deletedAt: now });
      await syncQueue.enqueue('user_permission_overrides', 'UPDATE', id, toSnake({ id, deletedAt: now } as unknown as Record<string, unknown>), existing.tenantId);
      await outboxService.enqueue(SystemEvents.SETTINGS_BUSINESS_UPDATED, MODULE_NAME, {
        action: 'override_removed', overrideId: id, permission: existing.permission,
      }, tx);
    });

    await logAuditEventOnly({
      eventName: SystemEvents.SETTINGS_BUSINESS_UPDATED,
      module: MODULE_NAME,
      payload: { action: 'override_removed', overrideId: id, userId: existing.userId, permission: existing.permission },
      context: { userId: session.userId, tenantId: existing.tenantId },
    });

    return success(undefined);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en removeOverride:', err);
    return failure(new AppError('OVERRIDE_DELETE_FAILED', 'Error al eliminar permiso individual.'));
  }
}

export async function getOverridesForUser(userId: string): Promise<Result<string[], AppError>> {
  try {
    const db = getDb();
    const session = useAuthStore.getState().session;
    const tenantId = session?.tenantId;
    if (!tenantId) return success([]);

    const overrides = await db.userPermissionOverrides
      .where('[userId+tenantId]')
      .equals([userId, tenantId])
      .filter((o) => !o.deletedAt)
      .toArray();
    return success(overrides.map((o) => o.permission));
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getOverridesForUser:', err);
    return failure(new AppError('OVERRIDES_FETCH_FAILED', 'Error al cargar permisos del usuario.'));
  }
}

export const userPermissionOverrideService = {
  getOverrides,
  addOverride,
  removeOverride,
  getOverridesForUser,
};
