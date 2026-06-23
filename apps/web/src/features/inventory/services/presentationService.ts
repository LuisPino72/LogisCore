import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake } from '@logiscore/shared';
import { getDb, isDbClosing } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { InventoryErrors } from '../../../specs/inventory/errors';
import type { Presentation, UpdatePresentationInput } from '../types';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useAuthStore } from '../../auth/stores/authStore';
import { toPresentation } from './mappers';

const INVENTORY_MODULE = 'INVENTORY';

export async function getAllPresentations(tenantId: string): Promise<Result<Presentation[], AppError>> {
    const db = getDb();
    try {
      let rows = await db.productPresentations
        .where({ tenantId })
        .filter((p) => !p.deletedAt)
        .toArray();

      if (rows.length === 0 && !isDbClosing()) {
        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        const { data, error } = await supabase
          .from('product_presentations')
          .select('*')
          .eq('tenant_id', tenantUuid)
          .is('deleted_at', null);

        if (!error && data && data.length > 0 && !isDbClosing()) {
          for (const pres of data) {
            await db.productPresentations.put({
              id: pres.id,
              tenantId,
              productId: pres.product_id,
              name: pres.name,
              priceUsd: pres.price_usd,
              unitMultiplier: pres.unit_multiplier,
              stockType: pres.stock_type || 'shared',
              barcode: pres.barcode,
              sortOrder: pres.sort_order,
              createdAt: pres.created_at,
              updatedAt: pres.updated_at ?? pres.created_at,
            });
          }
          rows = await db.productPresentations
            .where({ tenantId })
            .filter((p) => !p.deletedAt)
            .toArray();
        }
      }

      return success(rows.map((r) => toPresentation(r as unknown as Record<string, unknown>)));
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en getAllPresentations:', err);
      return failure(new AppError(InventoryErrors.PRESENTATION_NOT_FOUND, 'Error al cargar presentaciones.'));
    }
  }

export async function getPresentationsForProduct(productId: string): Promise<Result<Presentation[], AppError>> {
  const db = getDb();
  const session = useAuthStore.getState().session;
  if (!session?.tenantId) {
    return failure(new AppError(InventoryErrors.TENANT_REQUIRED, 'No hay tenant en sesión.'));
  }
  const productCheck = await db.products.where({ id: productId, tenantId: session.tenantId }).first();
  if (!productCheck || productCheck.deletedAt) {
    return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado en este tenant.'));
  }
  try {
    let rows = await db.productPresentations
      .where({ productId })
      .filter((p) => !p.deletedAt)
      .sortBy('sortOrder');

    if (rows.length === 0 && !isDbClosing()) {
      const tenantUuid = await TenantTranslator.slugToUuid(session.tenantId);
      const { data: remotePres, error } = await supabase
        .from('product_presentations')
        .select('*')
        .eq('product_id', productId)
        .eq('tenant_id', tenantUuid)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });

      if (!error && remotePres && remotePres.length > 0 && !isDbClosing()) {
        const now = new Date().toISOString();
        for (const pres of remotePres) {
          await db.productPresentations.put({
            id: pres.id,
            tenantId: '',
            productId: pres.product_id,
            name: pres.name,
            priceUsd: pres.price_usd,
            unitMultiplier: pres.unit_multiplier,
            stockType: pres.stock_type || 'shared',
            barcode: pres.barcode,
            sortOrder: pres.sort_order,
            createdAt: pres.created_at,
            updatedAt: pres.updated_at ?? now,
          });
        }
        rows = await db.productPresentations
          .where({ productId })
          .filter((p) => !p.deletedAt)
          .sortBy('sortOrder');
      }
    }

    return success(rows.map((r) => toPresentation(r as unknown as Record<string, unknown>)));
  } catch (err) {
    logger.error(INVENTORY_MODULE, 'Error en getPresentationsForProduct:', err);
    return failure(new AppError(InventoryErrors.PRESENTATION_NOT_FOUND, 'Error al cargar presentaciones.'));
  }
}

export async function updatePresentation(
  tenantId: string,
  presentationId: string,
  input: UpdatePresentationInput,
): Promise<Result<Presentation, AppError>> {
  const _updatePresSession = useAuthStore.getState().session;
  if (!_updatePresSession || !hasActionPermission(_updatePresSession, 'inventory', 'update')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);

  const db = getDb();
  try {
    const existing = await db.productPresentations.get(presentationId);
    if (!existing || existing.deletedAt) {
      return failure(new AppError(InventoryErrors.PRESENTATION_NOT_FOUND, 'Presentación no encontrada.'));
    }

    if (input.name !== undefined && !input.name.trim()) {
      return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, 'El nombre de la presentación no puede estar vacío.'));
    }

    if (input.unitMultiplier !== undefined && input.unitMultiplier <= 0) {
      return failure(new AppError(InventoryErrors.PRESENTATION_MULTIPLIER_INVALID, 'El multiplicador debe ser mayor a 0.'));
    }

    const newName = input.name;
    if (newName !== undefined && newName.trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
      const normalized = newName.trim().toLowerCase();
      const duplicate = await db.productPresentations
        .where({ productId: existing.productId })
        .filter((p) => !p.deletedAt && p.id !== presentationId && p.name.trim().toLowerCase() === normalized)
        .first();
      if (duplicate) {
        return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, `Ya existe una presentación llamada "${newName.trim()}".`));
      }
    }

    if (input.barcode !== undefined && input.barcode.trim()) {
      const barcodeTrimmed = input.barcode.trim();
      const allPres = await db.productPresentations.where({ tenantId }).filter((p) => !p.deletedAt && p.id !== presentationId).toArray();
      const duplicateBarcode = allPres.find((p) => p.barcode === barcodeTrimmed);
      if (duplicateBarcode) {
        return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, `El código de barras "${barcodeTrimmed}" ya está en uso por otro producto.`));
      }
    }

    const updated = {
      ...existing,
      ...(newName !== undefined && { name: newName.trim() }),
      ...(input.priceUsd !== undefined && { priceUsd: input.priceUsd }),
      ...(input.unitMultiplier !== undefined && { unitMultiplier: input.unitMultiplier }),
      ...(input.barcode !== undefined && { barcode: input.barcode }),
      updatedAt: new Date().toISOString(),
    };

    await db.transaction('rw', [db.productPresentations, db.products, db.syncQueue, db.outbox], async () => {
      await db.productPresentations.put(updated);
      await syncQueue.enqueue('product_presentations', 'UPDATE', presentationId, toSnake(updated as unknown as Record<string, unknown>), tenantId);
      await outboxService.enqueue('INVENTORY.UPDATED', INVENTORY_MODULE, { presentationId, changes: Object.keys(input) });
    });

    await logAuditEventOnly({
      eventName: 'INVENTORY.UPDATED',
      module: INVENTORY_MODULE,
      payload: { presentationId, changes: Object.keys(input) },
      context: { tenantId },
    });
    return success(toPresentation(updated as unknown as Record<string, unknown>));
  } catch (err) {
    logger.error(INVENTORY_MODULE, 'Error en updatePresentation:', err);
    return failure(new AppError(InventoryErrors.PRESENTATION_UPDATE_FAILED, 'Error al actualizar presentación.'));
  }
}

export async function deletePresentation(
  tenantId: string,
  presentationId: string,
): Promise<Result<void, AppError>> {
  const _deletePresSession = useAuthStore.getState().session;
  if (!_deletePresSession || !hasActionPermission(_deletePresSession, 'inventory', 'delete')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);

  const db = getDb();
  try {
    const existing = await db.productPresentations.get(presentationId);
    if (!existing || existing.deletedAt) {
      return failure(new AppError(InventoryErrors.PRESENTATION_NOT_FOUND, 'Presentación no encontrada.'));
    }

    const deletedAt = new Date().toISOString();
    await db.transaction('rw', [db.productPresentations, db.products, db.syncQueue, db.outbox], async () => {
      await db.productPresentations.update(presentationId, { deletedAt });
      await syncQueue.enqueue('product_presentations', 'DELETE', presentationId, { id: presentationId, deleted_at: deletedAt }, tenantId);
      await outboxService.enqueue('INVENTORY.UPDATED', INVENTORY_MODULE, { presentationId, action: 'deleted' });
    });

    await logAuditEventOnly({
      eventName: 'INVENTORY.UPDATED',
      module: INVENTORY_MODULE,
      payload: { presentationId, action: 'deleted' },
      context: { tenantId },
    });
    return success(undefined);
  } catch (err) {
    logger.error(INVENTORY_MODULE, 'Error en deletePresentation:', err);
    return failure(new AppError(InventoryErrors.PRESENTATION_NOT_FOUND, 'Error al eliminar presentación.'));
  }
}

export async function getPresentationByBarcode(barcode: string, tenantId: string): Promise<Presentation | null> {
  const db = getDb();
  const pres = await db.productPresentations
    .where({ tenantId })
    .filter((p) => !p.deletedAt && p.barcode === barcode && !!p.id)
    .first();
  if (pres) return toPresentation(pres as unknown as Record<string, unknown>);
  return null;
}
