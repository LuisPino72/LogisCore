import { success, failure, AppError, type Result } from '@logiscore/core';
import { getDb, type DexieNotification } from '../dexie/db';

function mapNotification(n: DexieNotification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    actionLabel: n.actionLabel,
    actionPayload: n.actionPayload ? JSON.parse(n.actionPayload) : undefined,
    createdAt: n.createdAt,
    read: n.read,
  };
}

function toDexie(n: {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionPayload?: unknown;
  createdAt: string;
  read: boolean;
}): DexieNotification {
  return {
    ...n,
    actionPayload: n.actionPayload ? JSON.stringify(n.actionPayload) : undefined,
  };
}

export const notificationService = {
  async addNotification(data: {
    tenantId: string;
    type: string;
    title: string;
    message: string;
    actionLabel?: string;
    actionPayload?: unknown;
  }): Promise<Result<ReturnType<typeof mapNotification>, AppError>> {
    try {
      const db = getDb();
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const entry = toDexie({ ...data, id, createdAt, read: false });
      await db.notifications.add(entry);
      return success(mapNotification(entry));
    } catch (err) {
      return failure(new AppError('NOTIFICATION_ADD_FAILED', 'Error al guardar notificación', { details: { error: String(err) } }));
    }
  },

  async loadNotifications(tenantId: string): Promise<Result<ReturnType<typeof mapNotification>[], AppError>> {
    try {
      const db = getDb();
      const rows = await db.notifications
        .where('tenantId')
        .equals(tenantId)
        .filter((n) => !n.deletedAt)
        .reverse()
        .sortBy('createdAt');
      return success(rows.map(mapNotification));
    } catch (err) {
      return failure(new AppError('NOTIFICATION_LOAD_FAILED', 'Error al cargar notificaciones', { details: { error: String(err) } }));
    }
  },

  async markAsRead(id: string): Promise<Result<void, AppError>> {
    try {
      const db = getDb();
      await db.notifications.update(id, { read: true });
      return success(undefined);
    } catch (err) {
      return failure(new AppError('NOTIFICATION_READ_FAILED', 'Error al marcar notificación como leída', { details: { error: String(err) } }));
    }
  },

  async dismissNotification(id: string): Promise<Result<void, AppError>> {
    try {
      const db = getDb();
      await db.notifications.update(id, { deletedAt: new Date().toISOString() });
      return success(undefined);
    } catch (err) {
      return failure(new AppError('NOTIFICATION_DISMISS_FAILED', 'Error al eliminar notificación', { details: { error: String(err) } }));
    }
  },

  async clearAll(tenantId: string): Promise<Result<number, AppError>> {
    try {
      const db = getDb();
      const now = new Date().toISOString();
      const rows = await db.notifications
        .where('tenantId')
        .equals(tenantId)
        .filter((n) => !n.deletedAt)
        .toArray();
      for (const row of rows) {
        await db.notifications.update(row.id, { deletedAt: now });
      }
      return success(rows.length);
    } catch (err) {
      return failure(new AppError('NOTIFICATION_CLEAR_FAILED', 'Error al limpiar notificaciones', { details: { error: String(err) } }));
    }
  },
};
