import { AppError, failure, success, type Result } from '@logiscore/core';
import { generateId } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useAuthStore } from '../../auth/stores/authStore';
import imageCompression from 'browser-image-compression';
import type { ImageLibrary } from '../../../specs/image-library';
import type { DexieImageLibrary } from '../../../services/dexie/types';

const INVENTORY_MODULE = 'INVENTORY';
const SYNC_TABLE = 'image_library';
const BUCKET = 'Products';
const LIBRARY_PREFIX = 'library';

// ============================================================
// GET
// ============================================================

export async function getLibraryImages(
  tenantId: string,
  categoryId?: string
): Promise<Result<ImageLibrary[], AppError>> {
  try {
    const db = getDb();

    let query = db.imageLibrary
      .where({ tenantId })
      .filter((img) => !img.deletedAt);

    if (categoryId) {
      query = db.imageLibrary
        .where({ tenantId, categoryId })
        .filter((img) => !img.deletedAt);
    }

    const local = await query.toArray();

    if (local.length > 0) {
      return success(local as ImageLibrary[]);
    }

    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    let queryBuilder = supabase
      .from(SYNC_TABLE)
      .select('*')
      .eq('tenant_id', tenantUuid)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });

    if (categoryId) {
      queryBuilder = queryBuilder.eq('category_id', categoryId);
    }

    const { data, error } = await queryBuilder;
    if (error) {
      logger.error(INVENTORY_MODULE, 'getLibraryImages supabase error:', error);
      return failure(new AppError('IMAGE_LIBRARY_FETCH_FAILED', 'Error al cargar biblioteca.'));
    }

    const mapped: ImageLibrary[] = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      imageUrl: row.image_url,
      isDefault: row.is_default,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    }));

    await db.transaction('rw', [db.imageLibrary], async () => {
      for (const img of mapped) {
        await db.imageLibrary.put(img as DexieImageLibrary);
      }
    });

    return success(mapped);
  } catch (e) {
    logger.error(INVENTORY_MODULE, 'getLibraryImages error:', e);
    return failure(new AppError('IMAGE_LIBRARY_FETCH_FAILED', 'Error al cargar biblioteca.'));
  }
}

// ============================================================
// UPLOAD
// ============================================================

export async function uploadLibraryImage(
  file: File,
  name: string,
  categoryId: string | null,
  isDefault: boolean,
  tenantId: string
): Promise<Result<ImageLibrary, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'inventory', 'manage_library')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta accion.'));
  }

  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return failure(new AppError('IMAGE_LIBRARY_INVALID_TYPE', 'Formato no soportado. Usa JPG, PNG o WebP.'));
  }
  if (file.size > 2 * 1024 * 1024) {
    return failure(new AppError('IMAGE_LIBRARY_TOO_LARGE', 'La imagen no puede superar 2MB.'));
  }

  try {
    const db = getDb();
    const { data: authSession } = await supabase.auth.getSession();
    if (!authSession.session) {
      return failure(new AppError('AUTH_NO_SESSION', 'No hay sesion activa.'));
    }
    const token = authSession.session.access_token;

    let compressedFile: File;
    try {
      compressedFile = await imageCompression(file, {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 1024,
        useWebWorker: false,
      });
    } catch {
      compressedFile = file;
    }

    const id = generateId();
    const ext = compressedFile.type.split('/')[1] || 'jpg';
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const filePath = `${tenantUuid}/${LIBRARY_PREFIX}/${id}.${ext}`;

    const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`;
    try {
      const buffer = await compressedFile.arrayBuffer();
      const res = await fetch(storageUrl, {
        method: 'PUT',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'content-type': compressedFile.type,
          'cache-control': '3600',
        },
        body: buffer,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        logger.error(INVENTORY_MODULE, 'uploadLibraryImage storage error:', res.status, errBody);
        return failure(new AppError('IMAGE_LIBRARY_UPLOAD_FAILED', `Error al subir imagen (${res.status}).`));
      }
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'uploadLibraryImage network error:', err);
      return failure(new AppError('IMAGE_LIBRARY_UPLOAD_FAILED', 'Error de red al subir imagen.'));
    }

    const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;

    const now = new Date().toISOString();
    const record: DexieImageLibrary = {
      id,
      tenantId,
      name,
      categoryId,
      imageUrl: publicUrl,
      isDefault,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await db.transaction('rw', [db.imageLibrary, db.categories, db.syncQueue, db.outbox], async () => {
      if (isDefault && categoryId) {
        await unsetDefaultForCategory(categoryId, tenantId, db);
      }
      await db.imageLibrary.add(record);
      await syncQueue.enqueue(SYNC_TABLE, 'CREATE', id, {
        id,
        tenant_id: tenantUuid,
        name,
        category_id: categoryId,
        image_url: publicUrl,
        is_default: isDefault,
        sort_order: 0,
      }, tenantId);
      await outboxService.enqueue('IMAGE_LIBRARY.CREATED', INVENTORY_MODULE, {
        imageId: id,
        name,
        categoryId,
      });
      if (isDefault && categoryId) {
        await updateCategoryDefaultImage(categoryId, publicUrl, tenantId, db);
      }
    });

    await logAuditEventOnly({
      eventName: 'IMAGE_LIBRARY.CREATED',
      module: INVENTORY_MODULE,
      payload: { imageId: id, name, categoryId },
      context: { tenantId },
    });

    return success(record as unknown as ImageLibrary);
  } catch (e) {
    logger.error(INVENTORY_MODULE, 'uploadLibraryImage error:', e);
    return failure(new AppError('IMAGE_LIBRARY_UPLOAD_FAILED', 'Error al subir imagen.'));
  }
}

// ============================================================
// UPDATE
// ============================================================

export async function updateLibraryImage(
  id: string,
  data: { name?: string; categoryId?: string | null; isDefault?: boolean; sortOrder?: number },
  tenantId: string
): Promise<Result<ImageLibrary, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'inventory', 'manage_library')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta accion.'));
  }

  try {
    const db = getDb();
    const existing = await db.imageLibrary.get(id);
    if (!existing) return failure(new AppError('IMAGE_LIBRARY_NOT_FOUND', 'Imagen no encontrada.'));

    const now = new Date().toISOString();
    const updated: DexieImageLibrary = {
      ...existing,
      ...data,
      updatedAt: now,
    };

    await db.transaction('rw', [db.imageLibrary, db.syncQueue], async () => {
      await db.imageLibrary.put(updated);
      await syncQueue.enqueue(SYNC_TABLE, 'UPDATE', id, {
        name: updated.name,
        category_id: updated.categoryId,
        is_default: updated.isDefault,
        sort_order: updated.sortOrder,
      }, tenantId);
    });

    return success(updated as unknown as ImageLibrary);
  } catch (e) {
    logger.error(INVENTORY_MODULE, 'updateLibraryImage error:', e);
    return failure(new AppError('IMAGE_LIBRARY_UPDATE_FAILED', 'Error al actualizar.'));
  }
}

// ============================================================
// DELETE
// ============================================================

export async function deleteLibraryImage(id: string, tenantId: string): Promise<Result<void, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'inventory', 'manage_library')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta accion.'));
  }

  try {
    const db = getDb();
    const existing = await db.imageLibrary.get(id);
    if (!existing) return failure(new AppError('IMAGE_LIBRARY_NOT_FOUND', 'Imagen no encontrada.'));

    const now = new Date().toISOString();
    await db.transaction('rw', [db.imageLibrary, db.syncQueue, db.outbox], async () => {
      await db.imageLibrary.update(id, { deletedAt: now });
      await syncQueue.enqueue(SYNC_TABLE, 'DELETE', id, { id, deleted_at: now }, tenantId);
      await outboxService.enqueue('IMAGE_LIBRARY.DELETED', INVENTORY_MODULE, { imageId: id });
    });

    await logAuditEventOnly({
      eventName: 'IMAGE_LIBRARY.DELETED',
      module: INVENTORY_MODULE,
      payload: { imageId: id },
      context: { tenantId },
    });

    if (existing.imageUrl) {
      try {
        const path = existing.imageUrl.split(`/storage/v1/object/public/${BUCKET}/`)[1];
        if (path) {
          const { data: authSession } = await supabase.auth.getSession();
          if (authSession.session) {
            await supabase.storage.from(BUCKET).remove([path]);
          }
        }
      } catch { /* no critico */ }
    }

    if (existing.isDefault && existing.categoryId) {
      await updateCategoryDefaultImage(existing.categoryId, null, tenantId, db);
    }

    return success(undefined);
  } catch (e) {
    logger.error(INVENTORY_MODULE, 'deleteLibraryImage error:', e);
    return failure(new AppError('IMAGE_LIBRARY_DELETE_FAILED', 'Error al eliminar.'));
  }
}

// ============================================================
// HELPERS
// ============================================================

async function unsetDefaultForCategory(categoryId: string, tenantId: string, db: ReturnType<typeof getDb>) {
  const currentDefaults = await db.imageLibrary
    .where({ tenantId, categoryId })
    .filter((img) => img.isDefault && !img.deletedAt)
    .toArray();

  for (const img of currentDefaults) {
    await db.imageLibrary.update(img.id, { isDefault: false });
    await syncQueue.enqueue(SYNC_TABLE, 'UPDATE', img.id, { is_default: false }, tenantId);
  }
}

async function updateCategoryDefaultImage(
  categoryId: string,
  imageUrl: string | null,
  tenantId: string,
  db: ReturnType<typeof getDb>
) {
  await db.categories.update(categoryId, { defaultImageUrl: imageUrl });
  await syncQueue.enqueue('categories', 'UPDATE', categoryId, {
    default_image_url: imageUrl,
  }, tenantId);
}

export async function getDefaultForCategory(
  categoryId: string,
  tenantId?: string
): Promise<string | null> {
  try {
    const db = getDb();
    const cat = await db.categories.get(categoryId);
    if (cat?.defaultImageUrl) return cat.defaultImageUrl;

    if (tenantId) {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      const { data } = await supabase
        .from('categories')
        .select('default_image_url')
        .eq('id', categoryId)
        .eq('tenant_id', tenantUuid)
        .single();
      return data?.default_image_url ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================
// ADMIN MODE — Supabase directo (sin Dexie)
// ============================================================

const LIBRARY_BUCKET = 'Library';

export async function adminGetLibraryImages(
  categoryId?: string
): Promise<Result<ImageLibrary[], AppError>> {
  try {
    let queryBuilder = supabase
      .from('image_library')
      .select('*')
      .is('tenant_id', null)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });

    if (categoryId) {
      queryBuilder = queryBuilder.eq('category_id', categoryId);
    }

    const { data, error } = await queryBuilder;
    if (error) {
      logger.error(INVENTORY_MODULE, 'adminGetLibraryImages error:', error);
      return failure(new AppError('IMAGE_LIBRARY_FETCH_FAILED', 'Error al cargar biblioteca.'));
    }

    const mapped: ImageLibrary[] = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      imageUrl: row.image_url,
      isDefault: row.is_default,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    }));

    return success(mapped);
  } catch (e) {
    logger.error(INVENTORY_MODULE, 'adminGetLibraryImages error:', e);
    return failure(new AppError('IMAGE_LIBRARY_FETCH_FAILED', 'Error al cargar biblioteca.'));
  }
}

export async function adminUploadImage(
  file: File,
  name: string,
  categoryId: string | null,
  isDefault: boolean
): Promise<Result<ImageLibrary, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'inventory', 'manage_library')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta accion.'));
  }

  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return failure(new AppError('IMAGE_LIBRARY_INVALID_TYPE', 'Formato no soportado. Usa JPG, PNG o WebP.'));
  }
  if (file.size > 2 * 1024 * 1024) {
    return failure(new AppError('IMAGE_LIBRARY_TOO_LARGE', 'La imagen no puede superar 2MB.'));
  }

  try {
    const { data: authSession } = await supabase.auth.getSession();
    if (!authSession.session) {
      return failure(new AppError('AUTH_NO_SESSION', 'No hay sesion activa.'));
    }
    const token = authSession.session.access_token;

    let compressedFile: File;
    try {
      compressedFile = await imageCompression(file, {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 1024,
        useWebWorker: false,
      });
    } catch {
      compressedFile = file;
    }

    const id = generateId();
    const ext = compressedFile.type.split('/')[1] || 'jpg';
    const filePath = `library/${id}.${ext}`;

    const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${LIBRARY_BUCKET}/${filePath}`;
    try {
      const buffer = await compressedFile.arrayBuffer();
      const res = await fetch(storageUrl, {
        method: 'PUT',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'content-type': compressedFile.type,
          'cache-control': '3600',
        },
        body: buffer,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        logger.error(INVENTORY_MODULE, 'adminUploadImage storage error:', res.status, errBody);
        return failure(new AppError('IMAGE_LIBRARY_UPLOAD_FAILED', `Error al subir imagen (${res.status}).`));
      }
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'adminUploadImage network error:', err);
      return failure(new AppError('IMAGE_LIBRARY_UPLOAD_FAILED', 'Error de red al subir imagen.'));
    }

    const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${LIBRARY_BUCKET}/${filePath}`;

    const now = new Date().toISOString();

    if (isDefault && categoryId) {
      await supabase
        .from('image_library')
        .update({ is_default: false })
        .eq('category_id', categoryId)
        .eq('is_default', true)
        .is('deleted_at', null);
    }

    const { data: insertData, error: insertError } = await supabase
      .from('image_library')
      .insert({
        id,
        tenant_id: null,
        name,
        category_id: categoryId,
        image_url: publicUrl,
        is_default: isDefault,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError) {
      logger.error(INVENTORY_MODULE, 'adminUploadImage insert error:', insertError);
      return failure(new AppError('IMAGE_LIBRARY_UPLOAD_FAILED', 'Error al guardar registro.'));
    }

    const record: ImageLibrary = {
      id: insertData.id,
      name: insertData.name,
      categoryId: insertData.category_id,
      imageUrl: insertData.image_url,
      isDefault: insertData.is_default,
      sortOrder: insertData.sort_order,
      createdAt: insertData.created_at,
      updatedAt: insertData.updated_at,
      deletedAt: insertData.deleted_at,
    };

    await logAuditEventOnly({
      eventName: 'IMAGE_LIBRARY.CREATED',
      module: INVENTORY_MODULE,
      payload: { imageId: id, name, categoryId },
      context: { tenantId: 'admin' },
    });

    return success(record);
  } catch (e) {
    logger.error(INVENTORY_MODULE, 'adminUploadImage error:', e);
    return failure(new AppError('IMAGE_LIBRARY_UPLOAD_FAILED', 'Error al subir imagen.'));
  }
}

export async function adminUpdateImage(
  id: string,
  data: { name?: string; categoryId?: string | null; isDefault?: boolean; sortOrder?: number }
): Promise<Result<ImageLibrary, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'inventory', 'manage_library')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta accion.'));
  }

  try {
    const now = new Date().toISOString();

    if (data.isDefault && data.categoryId) {
      await supabase
        .from('image_library')
        .update({ is_default: false })
        .eq('category_id', data.categoryId)
        .eq('is_default', true)
        .is('deleted_at', null)
        .neq('id', id);
    }

    const { data: updated, error } = await supabase
      .from('image_library')
      .update({
        name: data.name,
        category_id: data.categoryId,
        is_default: data.isDefault,
        sort_order: data.sortOrder,
        updated_at: now,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error(INVENTORY_MODULE, 'adminUpdateImage error:', error);
      return failure(new AppError('IMAGE_LIBRARY_UPDATE_FAILED', 'Error al actualizar.'));
    }

    return success({
      id: updated.id,
      name: updated.name,
      categoryId: updated.category_id,
      imageUrl: updated.image_url,
      isDefault: updated.is_default,
      sortOrder: updated.sort_order,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      deletedAt: updated.deleted_at,
    });
  } catch (e) {
    logger.error(INVENTORY_MODULE, 'adminUpdateImage error:', e);
    return failure(new AppError('IMAGE_LIBRARY_UPDATE_FAILED', 'Error al actualizar.'));
  }
}

export async function adminDeleteImage(id: string): Promise<Result<void, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'inventory', 'manage_library')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta accion.'));
  }

  try {
    const { data: existing } = await supabase
      .from('image_library')
      .select('image_url')
      .eq('id', id)
      .single();

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('image_library')
      .update({ deleted_at: now })
      .eq('id', id);

    if (error) {
      logger.error(INVENTORY_MODULE, 'adminDeleteImage error:', error);
      return failure(new AppError('IMAGE_LIBRARY_DELETE_FAILED', 'Error al eliminar.'));
    }

    if (existing?.image_url) {
      try {
        const path = existing.image_url.split(`/storage/v1/object/public/${LIBRARY_BUCKET}/`)[1];
        if (path) {
          await supabase.storage.from(LIBRARY_BUCKET).remove([path]);
        }
      } catch { /* no critico */ }
    }

    await logAuditEventOnly({
      eventName: 'IMAGE_LIBRARY.DELETED',
      module: INVENTORY_MODULE,
      payload: { imageId: id },
      context: { tenantId: 'admin' },
    });

    return success(undefined);
  } catch (e) {
    logger.error(INVENTORY_MODULE, 'adminDeleteImage error:', e);
    return failure(new AppError('IMAGE_LIBRARY_DELETE_FAILED', 'Error al eliminar.'));
  }
}
