import { type Result, success, failure, AppError, SystemEvents } from '@logiscore/core';
import { toSnake, generateId } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { PurchaseErrors } from '../../../specs/purchases/errors';
import type { Supplier, CreateSupplierInput } from '../../../specs/purchases';
import { CreateSupplierInputSchema } from '../../../specs/purchases';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useAuthStore } from '../../auth/stores/authStore';

const PURCHASES_MODULE = 'PURCHASES';

function toSupplier(raw: Record<string, unknown>): Supplier {
  return {
    id: raw.id as string,
    name: raw.name as string,
    rif: raw.rif as string | undefined,
    phone: raw.phone as string | undefined,
    balance: (raw.balance as number) ?? 0,
    creditLimit: raw.creditLimit as number | undefined,
    notes: raw.notes as string | undefined,
    address: raw.address as string | undefined,
    paymentTerms: raw.paymentTerms as string | undefined,
    createdAt: raw.createdAt as string,
    deletedAt: raw.deletedAt as string | undefined,
  };
}

export async function createSupplier(
  tenantId: string,
  userId: string,
  input: CreateSupplierInput,
): Promise<Result<Supplier, AppError>> {
  const _session = useAuthStore.getState().session;
  if (!_session || !hasActionPermission(_session, 'purchases', 'create')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const parsed = CreateSupplierInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      new AppError(
        PurchaseErrors.SUPPLIER_INVALID_INPUT,
        parsed.error.issues[0]?.message ?? 'Datos inválidos.',
      ),
    );
  }

  // DINERO-007 (A2): RIF único por tenant activo
  if (parsed.data.rif) {
    const rifUpper = parsed.data.rif.toUpperCase();
    const existing = await db.suppliers
      .where({ tenantId })
      .filter((s) => !s.deletedAt && s.rif === rifUpper)
      .first();
    if (existing) {
      return failure(
        new AppError(
          PurchaseErrors.SUPPLIER_RIF_DUPLICATE,
          `Ya existe un proveedor activo con el RIF ${rifUpper}.`,
        ),
      );
    }
  }

  const supplier: Supplier = {
    id,
    name: parsed.data.name.trim(),
    rif: parsed.data.rif?.toUpperCase() || undefined,
    phone: parsed.data.phone?.trim() || undefined,
    balance: 0,
    createdAt: now,
  };

  try {
    await db.transaction('rw', [db.suppliers, db.syncQueue, db.outbox], async () => {
      await db.suppliers.add({ ...supplier, tenantId, updatedAt: now });
      await syncQueue.enqueue('suppliers', 'CREATE', id, toSnake({ ...supplier, tenantId } as unknown as Record<string, unknown>), tenantId);
      await outboxService.enqueue(SystemEvents.PURCHASE_SUPPLIER_CREATED, PURCHASES_MODULE, { supplierId: id, name: input.name });
    });
    await logAuditEventOnly({
      eventName: SystemEvents.PURCHASE_SUPPLIER_CREATED,
      module: PURCHASES_MODULE,
      payload: { supplierId: id, name: input.name },
      context: { userId, tenantId },
    });
    return success(supplier);
  } catch (err) {
    logger.error(PURCHASES_MODULE, 'Error en createSupplier:', err);
    return failure(new AppError('SUPPLIER_CREATE_ERROR', 'Error al crear proveedor.'));
  }
}

export async function updateSupplier(
  id: string,
  input: Partial<CreateSupplierInput>,
  tenantId: string,
): Promise<Result<Supplier, AppError>> {
  const _session = useAuthStore.getState().session;
  if (!_session || !hasActionPermission(_session, 'purchases', 'update')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  try {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();

    if (input.name !== undefined || input.phone !== undefined) {
      const partial = CreateSupplierInputSchema.partial().safeParse(input);
      if (!partial.success) {
        return failure(new AppError('SUPPLIER_INVALID_INPUT', partial.error.issues[0]?.message || 'Datos inválidos.'));
      }
    }

    const existing = await db.suppliers.where({ id }).filter((s) => s.tenantId === tenantId && !s.deletedAt).first();
    if (!existing) {
      return failure(new AppError(PurchaseErrors.SUPPLIER_NOT_FOUND, 'Proveedor no encontrado.'));
    }

    if (input.rif !== undefined && input.rif !== null && input.rif !== existing.rif) {
      const rifUpper = input.rif.toUpperCase();
      const rifDuplicate = await db.suppliers
        .where({ tenantId })
        .filter((s) => !s.deletedAt && s.id !== id && s.rif === rifUpper)
        .first();
      if (rifDuplicate) {
        return failure(new AppError(
          PurchaseErrors.SUPPLIER_RIF_DUPLICATE,
          `Ya existe otro proveedor activo con RIF ${rifUpper}.`,
        ));
      }
      input.rif = rifUpper;
    }

    const updated = { ...existing, ...input };
    await db.transaction('rw', [db.suppliers, db.syncQueue, db.outbox], async () => {
      await db.suppliers.put(updated);
      await syncQueue.enqueue('suppliers', 'UPDATE', id, toSnake(updated as unknown as Record<string, unknown>), tenantId);
      await outboxService.enqueue(SystemEvents.PURCHASE_SUPPLIER_UPDATED, PURCHASES_MODULE, { supplierId: id });
    });
    await logAuditEventOnly({
      eventName: SystemEvents.PURCHASE_SUPPLIER_UPDATED,
      module: PURCHASES_MODULE,
      payload: { supplierId: id },
      context: { tenantId },
    });
    return success(toSupplier(updated as unknown as Record<string, unknown>));
  } catch (err) {
    logger.error(PURCHASES_MODULE, 'Error en updateSupplier:', err);
    return failure(new AppError('SUPPLIER_UPDATE_ERROR', 'Error al actualizar proveedor.'));
  }
}

export async function softDeleteSupplier(id: string, tenantId: string): Promise<Result<void, AppError>> {
  const _session = useAuthStore.getState().session;
  if (!_session || !hasActionPermission(_session, 'purchases', 'delete')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  try {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();
    const supplier = await db.suppliers.where({ id }).filter((s) => s.tenantId === tenantId && !s.deletedAt).first();
    if (!supplier) {
      return failure(new AppError(PurchaseErrors.SUPPLIER_NOT_FOUND, 'Proveedor no encontrado.'));
    }

    const ordersWithSupplier = await db.purchaseOrders
      .where({ tenantId })
      .filter((o) => o.supplierId === id && !o.deletedAt)
      .count();

    if (ordersWithSupplier > 0) {
      return failure(new AppError(PurchaseErrors.SUPPLIER_HAS_ORDERS, `No se puede eliminar: tiene ${ordersWithSupplier} orden${ordersWithSupplier !== 1 ? 'es' : ''} asociada${ordersWithSupplier !== 1 ? 's' : ''}.`));
    }

    const deletedAt = new Date().toISOString();
    await db.transaction('rw', [db.suppliers, db.syncQueue, db.outbox], async () => {
      await db.suppliers.update(id, { deletedAt });
      await syncQueue.enqueue('suppliers', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
      await outboxService.enqueue(SystemEvents.PURCHASE_SUPPLIER_DELETED, PURCHASES_MODULE, { supplierId: id });
    });
    await logAuditEventOnly({
      eventName: SystemEvents.PURCHASE_SUPPLIER_DELETED,
      module: PURCHASES_MODULE,
      payload: { supplierId: id },
      context: { tenantId },
    });
    return success(undefined);
  } catch (err) {
    logger.error(PURCHASES_MODULE, 'Error en softDeleteSupplier:', err);
    return failure(new AppError('SUPPLIER_DELETE_ERROR', 'Error al eliminar proveedor.'));
  }
}

export async function getSuppliers(tenantId: string): Promise<Result<Supplier[], AppError>> {
  const db = getDb();
  let rows = await db.suppliers
    .where({ tenantId })
    .filter((s) => !s.deletedAt)
    .toArray();

  if (rows.length === 0) {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return success([]);
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantUuid)
      .is('deleted_at', null);

    if (!error && data && data.length > 0) {
      for (const s of data) {
        await db.suppliers.put({
          id: s.id,
          tenantId,
          name: s.name,
          phone: s.phone,
          balance: Number(s.balance) || 0,
          createdAt: s.created_at,
          updatedAt: s.updated_at ?? s.created_at,
        });
      }
      rows = await db.suppliers.where({ tenantId }).filter((s) => !s.deletedAt).toArray();
    }
  }

  return success(rows.map((r) => toSupplier(r as unknown as Record<string, unknown>)));
}
