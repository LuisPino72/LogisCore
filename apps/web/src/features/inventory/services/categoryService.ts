import { type Result, success, failure, AppError, SystemEvents } from '@logiscore/core';
import { generateId } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { InventoryErrors } from '../../../specs/inventory/errors';
import type { Category } from '../types';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useAuthStore } from '../../auth/stores/authStore';
import { toCategory } from './mappers';
import { CreateCategoryInputSchema, UpdateCategoryInputSchema } from '../../../specs/inventory';

const INVENTORY_MODULE = 'INVENTORY';

export async function createCategory(input: { name: string; tenantId: string }): Promise<Result<Category, AppError>> {
  const _createCatSession = useAuthStore.getState().session;
  if (!_createCatSession || !hasActionPermission(_createCatSession, 'inventory', 'create')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);
  const db = getDb();

  const inputValidation = CreateCategoryInputSchema.safeParse({ name: input.name });
  if (!inputValidation.success) {
    return failure(new AppError(InventoryErrors.INVALID_INPUT, inputValidation.error.issues.map((e: { message: string }) => e.message).join('; ')));
  }

  const normalizedName = input.name.trim().toLowerCase();
  const existing = await db.categories
    .where({ tenantId: input.tenantId })
    .filter((c) => !c.deletedAt && c.name.trim().toLowerCase() === normalizedName)
    .first();
  if (existing) {
    return failure(new AppError('CATEGORY_DUPLICATE', `Ya existe una categoría llamada "${input.name.trim()}".`));
  }

  const id = generateId();
  const cat = { id, name: input.name, tenantId: input.tenantId };
  await db.transaction('rw', [db.categories, db.syncQueue, db.outbox], async () => {
    await db.categories.add(cat);
    await syncQueue.enqueue('categories', 'CREATE', id, { id, name: input.name }, input.tenantId);
    await outboxService.enqueue(SystemEvents.INVENTORY_CREATED, INVENTORY_MODULE, { categoryId: id, name: input.name });
  });
  await logAuditEventOnly({
    eventName: SystemEvents.INVENTORY_CREATED,
    module: INVENTORY_MODULE,
    payload: { categoryId: id, name: input.name },
    context: { tenantId: input.tenantId },
  });
  return success(toCategory(cat as unknown as Record<string, unknown>));
}

export async function updateCategory(id: string, name: string, tenantId: string): Promise<Result<Category, AppError>> {
  const _updateCatSession = useAuthStore.getState().session;
  if (!_updateCatSession || !hasActionPermission(_updateCatSession, 'inventory', 'update')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);
  const db = getDb();

  const inputValidation = UpdateCategoryInputSchema.safeParse({ name });
  if (!inputValidation.success) {
    return failure(new AppError(InventoryErrors.INVALID_INPUT, inputValidation.error.issues.map((e: { message: string }) => e.message).join('; ')));
  }

  const existing = await db.categories
    .where({ tenantId, id })
    .filter((c) => !c.deletedAt)
    .first();
  if (!existing) {
    return failure(new AppError(InventoryErrors.CATEGORY_NOT_FOUND, 'Categoría no encontrada en este tenant.'));
  }

  const duplicate = await db.categories
    .where({ tenantId })
    .filter((c) => !c.deletedAt && c.id !== id && c.name.toLowerCase() === name.toLowerCase())
    .first();
  if (duplicate) {
    return failure(new AppError(InventoryErrors.CATEGORY_DUPLICATE, 'Ya existe una categoría con ese nombre.'));
  }

  const updated = { name };
  await db.transaction('rw', [db.categories, db.syncQueue, db.outbox], async () => {
    await db.categories.update(id, updated);
    await syncQueue.enqueue('categories', 'UPDATE', id, { id, name }, tenantId);
    await outboxService.enqueue(SystemEvents.INVENTORY_UPDATED, INVENTORY_MODULE, { categoryId: id, name });
  });
  await logAuditEventOnly({
    eventName: SystemEvents.INVENTORY_UPDATED,
    module: INVENTORY_MODULE,
    payload: { categoryId: id, name },
    context: { tenantId },
  });
  return success({ id, name });
}

export async function getCategories(tenantId: string): Promise<Result<Category[], AppError>> {
  try {
    const db = getDb();
    let rows = await db.categories
      .where({ tenantId })
      .filter((c) => !c.deletedAt)
      .toArray();

    if (rows.length === 0) {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      const [tenantCats, predefinedCats] = await Promise.all([
        supabase.from('categories').select('*').eq('tenant_id', tenantUuid).is('deleted_at', null),
        supabase.from('categories').select('*').is('tenant_id', null).is('deleted_at', null),
      ]);

      if (!tenantCats.error && !predefinedCats.error) {
        const combined = [...(tenantCats.data ?? []), ...(predefinedCats.data ?? [])];
        const seen = new Set<string>();
        const data = combined.filter((d) => {
          if (seen.has(d.id)) return false;
          seen.add(d.id);
          return true;
        });

        if (data.length > 0) {
          for (const cat of data) {
            const localCat = {
              id: cat.id, tenantId,
              name: cat.name, isPredefined: cat.is_predefined,
            };
            await db.categories.put(localCat);
          }
          rows = data.map((d) => ({ id: d.id, name: d.name, isPredefined: d.is_predefined, tenantId }));
        }
      }
    }

    const seenNames = new Set<string>();
    const deduped = rows.filter((r) => {
      const key = (r.name ?? '').toLowerCase().trim();
      if (!key || seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

    return success(deduped.map((r) => toCategory(r as unknown as Record<string, unknown>)));
  } catch (err) {
    logger.error(INVENTORY_MODULE, 'Error en getCategories:', err);
    return failure(new AppError(InventoryErrors.CATEGORY_LIST_FAILED, 'Error al listar categorías.'));
  }
}

export async function deleteCategory(id: string, tenantId: string): Promise<Result<void, AppError>> {
  const _deleteCatSession = useAuthStore.getState().session;
  if (!_deleteCatSession || !hasActionPermission(_deleteCatSession, 'inventory', 'delete')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);
  const db = getDb();
  const productsInCategory = await db.products
    .where({ tenantId })
    .filter((p) => p.categoryId === id && !p.deletedAt)
    .count();

  if (productsInCategory > 0) {
    return failure(new AppError('CATEGORY_HAS_PRODUCTS', `No se puede eliminar: tiene ${productsInCategory} producto(s) asociado(s).`));
  }

  const deletedAt = new Date().toISOString();
  await db.transaction('rw', [db.categories, db.syncQueue, db.outbox], async () => {
    await db.categories.update(id, { deletedAt });
    await syncQueue.enqueue('categories', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
    await outboxService.enqueue(SystemEvents.INVENTORY_DELETED, INVENTORY_MODULE, { categoryId: id });
  });
  await logAuditEventOnly({
    eventName: SystemEvents.INVENTORY_DELETED,
    module: INVENTORY_MODULE,
    payload: { categoryId: id },
    context: { tenantId },
  });
  return success(undefined);
}

// ============================================================
// ADMIN MODE — Categorías globales (Supabase directo)
// ============================================================

export async function adminGetGlobalCategories(): Promise<Result<Category[], AppError>> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, created_at, updated_at, default_image_url')
      .is('tenant_id', null)
      .is('deleted_at', null)
      .order('name');

    if (error) {
      logger.error(INVENTORY_MODULE, 'adminGetGlobalCategories error:', error);
      return failure(new AppError('CATEGORIES_FETCH_FAILED', 'Error al cargar categorías.'));
    }

    const categories: Category[] = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      isPredefined: true,
      tenantId: '',
      defaultImageUrl: row.default_image_url,
    }));

    return success(categories);
  } catch (e) {
    logger.error(INVENTORY_MODULE, 'adminGetGlobalCategories error:', e);
    return failure(new AppError('CATEGORIES_FETCH_FAILED', 'Error al cargar categorías.'));
  }
}
