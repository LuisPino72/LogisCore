import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb, isDbClosing, type DexiePurchaseOrderItem, type DexieExpense } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { PurchaseErrors } from '../../../specs/purchases/errors';
import type {
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderWithItems,
  CreateSupplierInput,
  CreatePurchaseOrderInput,
  ReceivePurchaseOrderInput,
} from '../../../specs/purchases';
import { SupplierPaymentMethodSchema } from '../../../specs/purchases';
import { CreateSupplierInputSchema } from '../../../specs/purchases';
import { convertToStorage, unitToStorageType } from '../../inventory/types';
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

function toOrder(raw: Record<string, unknown>): PurchaseOrder {
  return {
    id: raw.id as string,
    supplierId: raw.supplierId as string,
    status: raw.status as PurchaseOrder['status'],
    totalUsd: raw.totalUsd as number,
    notes: raw.notes as string | undefined,
    createdBy: raw.createdBy as string,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: raw.deletedAt as string | undefined,
    paymentStatus: raw.paymentStatus as PurchaseOrder['paymentStatus'],
    dueDate: raw.dueDate as string | undefined,
    paidAt: raw.paidAt as string | undefined,
    paidAmountUsd: raw.paidAmountUsd as number | undefined,
  };
}

function toOrderItem(raw: Record<string, unknown>): PurchaseOrderItem {
  return {
    id: raw.id as string,
    orderId: raw.orderId as string,
    productId: raw.productId as string,
    presentationId: raw.presentationId as string | undefined,
    unitMultiplier: raw.unitMultiplier as number | undefined,
    productName: raw.productName as string,
    quantity: raw.quantity as number,
    costUsdPerUnit: raw.costUsdPerUnit as number,
    receivedQuantity: raw.receivedQuantity as number,
    totalUsd: raw.totalUsd as number,
    createdAt: raw.createdAt as string,
  };
}

export const purchaseService = {
  // ===== SUPPLIERS =====

  async createSupplier(
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
        await outboxService.enqueue('PURCHASE.SUPPLIER_CREATED', PURCHASES_MODULE, { supplierId: id, name: input.name });
      });
      // @event PURCHASE.SUPPLIER_CREATED — sin consumidores activos (auditoría únicamente)
      await logAuditEventOnly({
        eventName: 'PURCHASE.SUPPLIER_CREATED',
        module: PURCHASES_MODULE,
        payload: { supplierId: id, name: input.name },
        context: { userId, tenantId },
      });
      return success(supplier);
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en createSupplier:', err);
      return failure(new AppError('SUPPLIER_CREATE_ERROR', 'Error al crear proveedor.'));
    }
  },

  async updateSupplier(
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

      // Validar con Zod
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

      // PLAN-111 (#3): validar unicidad de RIF al actualizar (mismo patrón que createSupplier:94-108)
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
        await outboxService.enqueue('PURCHASE.SUPPLIER_UPDATED', PURCHASES_MODULE, { supplierId: id });
      });
      // @event PURCHASE.SUPPLIER_UPDATED — sin consumidores activos (auditoría únicamente)
      await logAuditEventOnly({
        eventName: 'PURCHASE.SUPPLIER_UPDATED',
        module: PURCHASES_MODULE,
        payload: { supplierId: id },
        context: { tenantId },
      });
      return success(toSupplier(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en updateSupplier:', err);
      return failure(new AppError('SUPPLIER_UPDATE_ERROR', 'Error al actualizar proveedor.'));
    }
  },

  async softDeleteSupplier(id: string, tenantId: string): Promise<Result<void, AppError>> {
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
        await outboxService.enqueue('PURCHASE.SUPPLIER_DELETED', PURCHASES_MODULE, { supplierId: id });
      });
      // @event PURCHASE.SUPPLIER_DELETED — sin consumidores activos (auditoría únicamente)
      await logAuditEventOnly({
        eventName: 'PURCHASE.SUPPLIER_DELETED',
        module: PURCHASES_MODULE,
        payload: { supplierId: id },
        context: { tenantId },
      });
      return success(undefined);
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en softDeleteSupplier:', err);
      return failure(new AppError('SUPPLIER_DELETE_ERROR', 'Error al eliminar proveedor.'));
    }
  },

  async getSuppliers(tenantId: string): Promise<Result<Supplier[], AppError>> {
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
  },

  // ===== PURCHASE ORDERS =====

  async createOrder(
    tenantId: string,
    userId: string,
    input: CreatePurchaseOrderInput,
  ): Promise<Result<PurchaseOrder, AppError>> {
    const _session2 = useAuthStore.getState().session;
    if (!_session2 || !hasActionPermission(_session2, 'purchases', 'create')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();

    // P6: Validar que supplierId exista
    const supplier = await db.suppliers.where({ id: input.supplierId }).filter((s) => s.tenantId === tenantId && !s.deletedAt).first();
    if (!supplier) {
      return failure(new AppError(PurchaseErrors.SUPPLIER_NOT_FOUND, 'El proveedor seleccionado no existe.'));
    }

    // P5: Validar productos duplicados
    const productIds = input.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      return failure(new AppError('PURCHASE_DUPLICATE_PRODUCTS', 'No puede haber dos items del mismo producto en la orden.'));
    }

    // P6: Validar que todos los productIds existan y no sean producto_terminado
    const invalidProducts: string[] = [];
    const forbiddenProducts: string[] = [];
    for (const item of input.items) {
      const product = await db.products.where({ id: item.productId }).filter((p) => p.tenantId === tenantId && !p.deletedAt).first();
      if (!product) {
        invalidProducts.push(item.productId.slice(0, 8));
      } else if (product.productType === 'producto_terminado') {
        forbiddenProducts.push(product.name);
      }
    }
    if (invalidProducts.length > 0) {
      return failure(new AppError('PURCHASE_INVALID_PRODUCTS', `Productos no encontrados: ${invalidProducts.join(', ')}`));
    }
    if (forbiddenProducts.length > 0) {
      return failure(new AppError('PURCHASE_FORBIDDEN_PRODUCT_TYPE', `No se pueden comprar productos terminados: ${forbiddenProducts.join(', ')}`));
    }

    // Validar que presentationIds existan (solo items con presentationId)
    const invalidPresentations: string[] = [];
    for (const item of input.items) {
      if (item.presentationId) {
        const pres = await db.productPresentations.get(item.presentationId);
        if (!pres || pres.deletedAt || pres.tenantId !== tenantId) {
          invalidPresentations.push(item.presentationId.slice(0, 8));
        }
      }
    }
    if (invalidPresentations.length > 0) {
      return failure(new AppError('PURCHASE_INVALID_PRESENTATIONS',
        `Presentaciones no encontradas: ${invalidPresentations.join(', ')}`));
    }

    const id = generateId();
    const now = new Date().toISOString();

    const totalUsd = input.items.reduce((sum, item) => sum + item.totalCostUsd, 0);

    const order: PurchaseOrder = {
      id,
      supplierId: input.supplierId,
      status: 'draft',
      totalUsd,
      notes: input.notes,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    const productMap = new Map<string, string>();
    for (const item of input.items) {
      const product = await getDb().products.get(item.productId);
      productMap.set(item.productId, product?.name ?? item.productId.slice(0, 8));
    }

    const items: PurchaseOrderItem[] = input.items.map((item) => ({
      id: generateId(),
      orderId: id,
      productId: item.productId,
      presentationId: item.presentationId,
      unitMultiplier: item.unitMultiplier ?? 1, // PLAN-111 (#8): default 1 si no llega
      productName: productMap.get(item.productId) ?? '',
      quantity: item.quantity,
      costUsdPerUnit: preciseRound(item.totalCostUsd / item.quantity, 2),
      receivedQuantity: 0,
      totalUsd: item.totalCostUsd,
      createdAt: now,
    }));

    try {
      await db.transaction('rw', [db.purchaseOrders, db.purchaseOrderItems, db.syncQueue, db.outbox], async () => {
        await db.purchaseOrders.add({ ...order, tenantId });
        await db.purchaseOrderItems.bulkAdd(items.map((i) => ({ ...i, tenantId })));

        await syncQueue.enqueue('purchase_orders', 'CREATE', id, toSnake({ ...order, tenantId } as unknown as Record<string, unknown>), tenantId);
        for (const item of items) {
          await syncQueue.enqueue('purchase_order_items', 'CREATE', item.id, toSnake({ ...item, tenantId } as unknown as Record<string, unknown>), tenantId);
        }
        await outboxService.enqueue('PURCHASE.CREATED', PURCHASES_MODULE, { orderId: id, supplierId: input.supplierId, totalUsd });
      });

      // @event PURCHASE.CREATED — sin consumidores activos (auditoría únicamente)
      await logAuditEventOnly({
        eventName: 'PURCHASE.CREATED',
        module: PURCHASES_MODULE,
        payload: { orderId: id, supplierId: input.supplierId, totalUsd },
        context: { userId, tenantId },
      });
      return success(order);
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en createOrder:', err);
      return failure(new AppError('PURCHASE_CREATE_ERROR', 'Error al crear orden de compra.'));
    }
  },

  async updateOrder(
    id: string,
    tenantId: string,
    userId: string,
    input: Partial<CreatePurchaseOrderInput>,
  ): Promise<Result<PurchaseOrder, AppError>> {
    const _session = useAuthStore.getState().session;
    if (!_session || !hasActionPermission(_session, 'purchases', 'update')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();
    const order = await db.purchaseOrders.where({ id }).filter((o) => o.tenantId === tenantId && !o.deletedAt).first();
    if (!order) {
      return failure(new AppError(PurchaseErrors.ORDER_NOT_FOUND, 'Orden no encontrada.'));
    }
    if (order.status !== 'draft') {
      return failure(new AppError(PurchaseErrors.ORDER_INVALID_STATUS, 'Solo órdenes en borrador pueden editarse.'));
    }

    if (!input.items || input.items.length === 0) {
      return failure(new AppError('PURCHASE_UPDATE_NO_ITEMS', 'La orden debe tener al menos un producto.'));
    }

    // Validar productos duplicados
    const productIds = input.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      return failure(new AppError('PURCHASE_DUPLICATE_PRODUCTS', 'No puede haber dos items del mismo producto en la orden.'));
    }

    // Validar que presentationIds existan (solo items con presentationId)
    const invalidPresentations: string[] = [];
    for (const item of input.items) {
      if (item.presentationId) {
        const pres = await db.productPresentations.get(item.presentationId);
        if (!pres || pres.deletedAt || pres.tenantId !== tenantId) {
          invalidPresentations.push(item.presentationId.slice(0, 8));
        }
      }
    }
    if (invalidPresentations.length > 0) {
      return failure(new AppError('PURCHASE_INVALID_PRESENTATIONS',
        `Presentaciones no encontradas: ${invalidPresentations.join(', ')}`));
    }

    // Preservar createdAt original de items existentes
    const existingItems = await db.purchaseOrderItems.where({ orderId: id }).toArray();
    const existingItemByProductId = new Map(existingItems.map((i) => [i.productId, i]));

    const now = new Date().toISOString();
    const totalUsd = input.items.reduce((sum, item) => sum + item.totalCostUsd, 0);

    const productMap = new Map<string, string>();
    for (const item of input.items) {
      const product = await db.products.where({ id: item.productId, tenantId }).first();
      productMap.set(item.productId, product?.name ?? item.productId.slice(0, 8));
    }

    const newItems: PurchaseOrderItem[] = input.items.map((item) => ({
      id: generateId(),
      orderId: id,
      productId: item.productId,
      presentationId: item.presentationId,
      unitMultiplier: item.unitMultiplier ?? 1, // PLAN-111 (#8): default 1 si no llega
      productName: productMap.get(item.productId) ?? '',
      quantity: item.quantity,
      costUsdPerUnit: preciseRound(item.totalCostUsd / item.quantity, 2),
      receivedQuantity: 0,
      totalUsd: item.totalCostUsd,
      createdAt: existingItemByProductId.get(item.productId)?.createdAt ?? now,
    }));

    try {
      await db.transaction('rw', [db.purchaseOrders, db.purchaseOrderItems, db.syncQueue, db.outbox], async () => {
        const oldItems = await db.purchaseOrderItems.where({ orderId: id }).toArray();
        for (const old of oldItems) {
          await db.purchaseOrderItems.update(old.id, { deletedAt: now });
          await syncQueue.enqueue('purchase_order_items', 'DELETE', old.id, { id: old.id, deleted_at: now }, tenantId);
        }

        const supplierId = input.supplierId ?? order.supplierId;
        const updatedOrder = { ...order, supplierId, totalUsd, notes: input.notes, updatedAt: now };
        await db.purchaseOrders.put(updatedOrder);
        await db.purchaseOrderItems.bulkAdd(newItems.map((i) => ({ ...i, tenantId })));

        await syncQueue.enqueue('purchase_orders', 'UPDATE', id, toSnake({ ...updatedOrder, tenantId } as unknown as Record<string, unknown>), tenantId);
        for (const item of newItems) {
          await syncQueue.enqueue('purchase_order_items', 'CREATE', item.id, toSnake({ ...item, tenantId } as unknown as Record<string, unknown>), tenantId);
        }
        await outboxService.enqueue('PURCHASE.UPDATED', PURCHASES_MODULE, { orderId: id });
      });

      // @event PURCHASE.UPDATED — sin consumidores activos (auditoría únicamente)
      await logAuditEventOnly({
        eventName: 'PURCHASE.UPDATED',
        module: PURCHASES_MODULE,
        payload: { orderId: id },
        context: { userId, tenantId },
      });
      return success(toOrder({ ...order, totalUsd } as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en updateOrder:', err);
      return failure(new AppError('PURCHASE_UPDATE_ERROR', 'Error al actualizar orden.'));
    }
  },

  async softDeleteOrder(id: string, tenantId: string): Promise<Result<void, AppError>> {
    try {
      const _session = useAuthStore.getState().session;
      if (!_session || !hasActionPermission(_session, 'purchases', 'delete')) {
        return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
      }
      const networkCheck = requireNetwork();
      if (!networkCheck.ok) return failure(networkCheck.error);
      const db = getDb();
      const order = await db.purchaseOrders.where({ id }).filter((o) => o.tenantId === tenantId && !o.deletedAt).first();
      if (!order) {
        return failure(new AppError(PurchaseErrors.ORDER_NOT_FOUND, 'Orden no encontrada.'));
      }
      // PLAN-111 (A2): no permitir borrar órdenes received o partially_received
      // (rompen la cadena FIFO vía inventory lots).
      if (order.status === 'received' || order.status === 'partially_received') {
        return failure(new AppError(
          PurchaseErrors.ORDER_INVALID_STATUS,
          `No se puede eliminar una orden en estado "${order.status}". Cancélala primero.`,
        ));
      }
      const deletedAt = new Date().toISOString();
      await db.transaction('rw', [db.purchaseOrders, db.syncQueue, db.outbox], async () => {
        await db.purchaseOrders.update(id, { deletedAt });
        await syncQueue.enqueue('purchase_orders', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
        await outboxService.enqueue('PURCHASE.DELETED', PURCHASES_MODULE, { orderId: id });
      });
      // @event PURCHASE.DELETED — sin consumidores activos (auditoría únicamente)
      await logAuditEventOnly({
        eventName: 'PURCHASE.DELETED',
        module: PURCHASES_MODULE,
        payload: { orderId: id },
        context: { tenantId },
      });
      return success(undefined);
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en softDeleteOrder:', err);
      return failure(new AppError('ORDER_DELETE_ERROR', 'Error al eliminar orden.'));
    }
  },

  async confirmOrder(id: string, tenantId: string): Promise<Result<PurchaseOrder, AppError>> {
    try {
      const _session = useAuthStore.getState().session;
      if (!_session || !hasActionPermission(_session, 'purchases', 'update')) {
        return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
      }
      const networkCheck = requireNetwork();
      if (!networkCheck.ok) return failure(networkCheck.error);
      const db = getDb();
      const order = await db.purchaseOrders.where({ id }).filter((o) => o.tenantId === tenantId && !o.deletedAt).first();
      // PLAN-111 (A3): idempotency guard
      if (order && order.status === 'confirmed') {
        return success(toOrder(order as unknown as Record<string, unknown>));
      }
      if (!order) {
        return failure(new AppError(PurchaseErrors.ORDER_NOT_FOUND, 'Orden no encontrada.'));
      }
      if (order.status !== 'draft') {
        return failure(new AppError(PurchaseErrors.ORDER_INVALID_STATUS, 'Solo órdenes en borrador pueden ser confirmadas.'));
      }

      const updated = { ...order, status: 'confirmed' as const, updatedAt: new Date().toISOString() };
      await db.transaction('rw', [db.purchaseOrders, db.syncQueue, db.outbox], async () => {
        await db.purchaseOrders.put(updated);
        await syncQueue.enqueue('purchase_orders', 'UPDATE', id, toSnake({ ...updated, tenantId } as unknown as Record<string, unknown>), tenantId);
        await outboxService.enqueue('PURCHASE.CONFIRMED', PURCHASES_MODULE, { orderId: id });
      });
      // @event PURCHASE.CONFIRMED — sin consumidores activos (auditoría únicamente)
      await logAuditEventOnly({
        eventName: 'PURCHASE.CONFIRMED',
        module: PURCHASES_MODULE,
        payload: { orderId: id },
        context: { tenantId },
      });
      return success(toOrder(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en confirmOrder:', err);
      return failure(new AppError('ORDER_CONFIRM_ERROR', 'Error al confirmar orden.'));
    }
  },

  async receiveOrder(
    id: string,
    input: ReceivePurchaseOrderInput,
    tenantId: string,
    userId: string,
    exchangeRate: number,
  ): Promise<Result<PurchaseOrder, AppError>> {
    const _session = useAuthStore.getState().session;
    if (!_session || !hasActionPermission(_session, 'purchases', 'receive_order')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();
    const order = await db.purchaseOrders.where({ id }).filter((o) => o.tenantId === tenantId && !o.deletedAt).first();
    if (!order) {
      return failure(new AppError(PurchaseErrors.ORDER_NOT_FOUND, 'Orden no encontrada.'));
    }
    if (order.status === 'received' || order.status === 'cancelled') {
      return failure(new AppError(PurchaseErrors.ORDER_ALREADY_RECEIVED, 'La orden ya fue recibida o cancelada.'));
    }
    if (order.status !== 'confirmed' && order.status !== 'partially_received') {
      return failure(new AppError(PurchaseErrors.ORDER_INVALID_STATUS, 'La orden debe estar confirmada para recibir.'));
    }

    // P6: Validar que supplierId exista
    const supplier = await db.suppliers.where({ id: order.supplierId }).filter((s) => s.tenantId === tenantId && !s.deletedAt).first();
    if (!supplier) {
      return failure(new AppError(PurchaseErrors.SUPPLIER_NOT_FOUND, 'El proveedor de la orden ya no existe.'));
    }

    // Validar que supplierId y productIds existan en la orden
    const items = await db.purchaseOrderItems.where({ orderId: id }).toArray();
    const itemMap = new Map(items.map((i) => [i.id, i]));

    let totalReceived = 0;
    let totalOrdered = 0;
    for (const item of items) {
      totalOrdered += item.quantity;
      const received = input.items.find((ri) => ri.itemId === item.id);
      if (received) {
        const newReceived = item.receivedQuantity + received.receivedQuantity;
        if (newReceived > item.quantity) {
          return failure(new AppError(PurchaseErrors.ORDER_RECEIVE_EXCEEDS, `Recibido excede lo ordenado para producto.`));
        }
        totalReceived += newReceived;
      } else {
        totalReceived += item.receivedQuantity;
      }
    }

    const now = new Date().toISOString();
    const newStatus: PurchaseOrder['status'] = totalReceived >= totalOrdered ? 'received' : 'partially_received';

    // Validar que todos los productos a recibir existan y no estén borrados
    const deletedProducts: string[] = [];
    for (const rec of input.items) {
      const item = itemMap.get(rec.itemId);
      if (!item) continue;
      if (rec.receivedQuantity > 0) {
        const product = await db.products.where({ id: item.productId, tenantId }).first();
        if (!product || product.deletedAt) {
          deletedProducts.push(item.productName ?? item.productId.slice(0, 8));
        }
      }
    }
    if (deletedProducts.length > 0) {
      return failure(new AppError(PurchaseErrors.ORDER_RECEIVE_EXCEEDS,
        `No se puede recibir: el(los) producto(s) "${deletedProducts.join(', ')}" han sido eliminados. Restáurelos o cree una nueva orden.`));
    }

    try {
      await db.transaction('rw', [
        db.purchaseOrders,
        db.purchaseOrderItems,
        db.products,
        db.inventoryMovements,
        db.inventoryLots,
        db.syncQueue,
        db.outbox,
        db.expenses,
        db.suppliers,
      ], async () => {
        for (const rec of input.items) {
          // P3: Re-leer item dentro de la transacción para evitar doble recepción
          const item = await db.purchaseOrderItems.get(rec.itemId);
          if (!item) continue;

          const newReceivedQty = item.receivedQuantity + rec.receivedQuantity;
          // PLAN-111 (#1): throw new AppError — Dexie solo hace rollback con throw,
          // NO con return failure (que confirma el tx y retorna el value).
          // DINERO-008 (A3): validación "no exceder" DENTRO de la transacción
          // (la pre-validación arriba puede pasar en race conditions con 2 recepciones concurrentes).
          if (newReceivedQty > item.quantity) {
            throw new AppError(
              PurchaseErrors.ORDER_RECEIVE_EXCEEDS,
              `Recibido excede lo ordenado para producto "${item.productName ?? item.productId.slice(0, 8)}". Ordenado: ${item.quantity}, ya recibido: ${item.receivedQuantity}, intento: ${rec.receivedQuantity}.`,
            );
          }
          await db.purchaseOrderItems.update(item.id, { receivedQuantity: newReceivedQty });
          await syncQueue.enqueue('purchase_order_items', 'UPDATE', item.id, toSnake({
            ...item,
            receivedQuantity: newReceivedQty,
          } as unknown as Record<string, unknown>), tenantId);

          if (rec.receivedQuantity > 0) {
            // P4: Re-leer product dentro de la transacción para WAC preciso
            const product = await db.products.where({ id: item.productId, tenantId }).first();
            if (!product) continue;

            const storageQty = product.isWeighted
              ? convertToStorage(rec.receivedQuantity, unitToStorageType(product.isWeighted, product.unit))
              : rec.receivedQuantity;

            const effectiveQty = storageQty * (item.unitMultiplier ?? 1);

            const previousStock = product.stock;
            const newStock = previousStock + effectiveQty;

            // Convertir $/display-unit a $/storage-unit para consistencia con stock (gramos/ml)
            const previousCostStorage = product.isWeighted
              ? (product.costPrice ?? 0) / 1000
              : (product.costPrice ?? 0);
            // DINERO-002 (C2): dividir costUsdPerUnit por unitMultiplier para presentaciones (Caja×6, etc.)
            // costUsdPerUnit está en $/presentation-unit (caja); storage unit = unidad base (gramo, ml, und).
            const divisor = item.unitMultiplier ?? 1;
            const itemCostStorage = product.isWeighted
              ? ((item.costUsdPerUnit || 0) / divisor) / 1000
              : (item.costUsdPerUnit || 0) / divisor;

            // Calcular Costo Promedio Ponderado (WAC) en storage units ($/g)
            const totalLotCost = (previousStock * previousCostStorage) + (effectiveQty * itemCostStorage);
            const newCostPriceStorage = newStock > 0 ? preciseRound(totalLotCost / newStock, 4) : itemCostStorage;

            // Convertir a $/display-unit para product.costPrice ($/kg, $/lt, $/unidad)
            const newCostPrice = product.isWeighted
              ? preciseRound(newCostPriceStorage * 1000, 4)
              : newCostPriceStorage;

            const movementId = generateId();
            const movement = {
              id: movementId,
              tenantId,
              productId: item.productId,
              userId,
              type: 'purchase' as const,
              quantity: effectiveQty,
              previousStock,
              newStock,
              // PLAN-111 (#5): persistir costUsd en inventory_movement (trazabilidad FIFO)
              costUsd: preciseRound(effectiveQty * itemCostStorage, 2),
              createdAt: now,
            };
            const lot = {
              id: generateId(),
              tenantId,
              productId: item.productId,
              quantityAdded: effectiveQty,
              remainingQuantity: effectiveQty,
              costUsdPerUnit: itemCostStorage,
            sourceMovementId: movementId,
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          await db.products.update(item.productId, { stock: newStock, costPrice: newCostPrice });
            await db.inventoryMovements.add(movement);
            await db.inventoryLots.add(lot);
            await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
            await syncQueue.enqueue('inventory_lots', 'CREATE', lot.id, toSnake(lot as unknown as Record<string, unknown>), tenantId);
            await syncQueue.enqueue('products', 'UPDATE', item.productId, toSnake({
              ...product,
              stock: newStock,
              costPrice: newCostPrice,
            } as unknown as Record<string, unknown>), tenantId);
          }
        }

        const updatedOrder = { ...order, status: newStatus, updatedAt: now };
        await db.purchaseOrders.put(updatedOrder);
        await syncQueue.enqueue('purchase_orders', 'UPDATE', id, toSnake({ ...updatedOrder, tenantId } as unknown as Record<string, unknown>), tenantId);
        await outboxService.enqueue('PURCHASE.RECEIVED', PURCHASES_MODULE, { orderId: id, status: newStatus });

        let totalReceivedUsd = 0;
        for (const rec of input.items) {
          // PLAN-111 (A1): re-leer item DENTRO de la tx (itemMap del outer scope puede tener
          // costUsdPerUnit stale si la orden fue editada entre el read y el write).
          const freshItem = await db.purchaseOrderItems.get(rec.itemId);
          if (!freshItem || rec.receivedQuantity <= 0) continue;
          totalReceivedUsd += preciseRound(rec.receivedQuantity * (freshItem.costUsdPerUnit ?? 0), 2);
        }
        if (totalReceivedUsd > 0) {
          // PLAN-113 (C2): idempotency check — si ya hay expense activo para esta orden,
          // no crear duplicado (race condition: tx commitea pero response se pierde y se reintenta).
          const existingForOrder = await db.expenses
            .where({ purchaseOrderId: id })
            .filter((e) => !e.deletedAt)
            .first();
          if (existingForOrder) {
            logger.warn(PURCHASES_MODULE, 'C2: receiveOrder idempotency, expense already exists', { orderId: id, expenseId: existingForOrder.id });
          } else {
            const currentRate = exchangeRate;
            const expenseId = generateId();
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const expense: DexieExpense = {
              id: expenseId,
              tenantId,
              createdByUserId: userId,
              category: 'COMPRA_INVENTARIO',
              amountUsd: totalReceivedUsd,
              exchangeRate: currentRate,
              amountBs: preciseRound(totalReceivedUsd * currentRate, 2),
              description: `Compra orden #${order.id.slice(0, 8)}`,
              date: today,
              isRecurring: false,
              status: 'pending',
              createdAt: now,
              updatedAt: now,
              purchaseOrderId: id, // PLAN-113 (C2): FK a purchase_orders para idempotencia
            };
            await db.expenses.add(expense);
            await syncQueue.enqueue('expenses', 'CREATE', expenseId, toSnake(expense as unknown as Record<string, unknown>), tenantId);
            // PLAN-111 (A4): emitir outbox event EXPENSE.CREATED para que módulos downstream
            // (cash-flow dashboards, etc.) vean este gasto.
            await outboxService.enqueue('EXPENSE.CREATED', PURCHASES_MODULE, { expenseId, amountUsd: totalReceivedUsd, category: 'COMPRA_INVENTARIO' });
          }
        }

        const supplierRec = await db.suppliers.get(order.supplierId);
        if (supplierRec) {
          const newBalance = preciseRound((supplierRec.balance || 0) + totalReceivedUsd, 2);
          await db.suppliers.update(order.supplierId, { balance: newBalance });
          await syncQueue.enqueue('suppliers', 'UPDATE', order.supplierId, toSnake({
            ...supplierRec,
            balance: newBalance,
          } as unknown as Record<string, unknown>), tenantId);
        }
        await db.purchaseOrders.update(order.id, {
          paymentStatus: 'pending',
          paidAmountUsd: 0,
          dueDate: input.dueDate || undefined,
        });
      });

      await logAuditEventOnly({
        eventName: 'PURCHASE.RECEIVED',
        module: PURCHASES_MODULE,
        payload: { orderId: id, status: newStatus },
        context: { userId, tenantId },
      });
      return success(toOrder({ ...order, status: newStatus, updatedAt: now } as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error('receiveOrder', 'Error:', err);
      return failure(new AppError('PURCHASE_RECEIVE_ERROR', 'Error al recibir orden.'));
    }
  },

  async cancelOrder(id: string, tenantId: string): Promise<Result<PurchaseOrder, AppError>> {
    try {
      const _session = useAuthStore.getState().session;
      if (!_session || !hasActionPermission(_session, 'purchases', 'update')) {
        return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
      }
      const networkCheck = requireNetwork();
      if (!networkCheck.ok) return failure(networkCheck.error);
      const db = getDb();
      const order = await db.purchaseOrders.where({ id }).filter((o) => o.tenantId === tenantId && !o.deletedAt).first();
      if (!order) {
        return failure(new AppError(PurchaseErrors.ORDER_NOT_FOUND, 'Orden no encontrada.'));
      }
      if (order.status !== 'draft' && order.status !== 'confirmed') {
        return failure(new AppError(PurchaseErrors.ORDER_CANCEL_NOT_ALLOWED, 'Solo borradores o confirmadas pueden cancelarse.'));
      }

      const updated = { ...order, status: 'cancelled' as const, updatedAt: new Date().toISOString() };
      await db.transaction('rw', [db.purchaseOrders, db.syncQueue, db.outbox], async () => {
        await db.purchaseOrders.put(updated);
        await syncQueue.enqueue('purchase_orders', 'UPDATE', id, toSnake({ ...updated, tenantId } as unknown as Record<string, unknown>), tenantId);
        await outboxService.enqueue('PURCHASE.CANCELLED', PURCHASES_MODULE, { orderId: id });
      });
      // @event PURCHASE.CANCELLED — sin consumidores activos (auditoría únicamente)
      await logAuditEventOnly({
        eventName: 'PURCHASE.CANCELLED',
        module: PURCHASES_MODULE,
        payload: { orderId: id },
        context: { tenantId },
      });
      return success(toOrder(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en cancelOrder:', err);
      return failure(new AppError('ORDER_CANCEL_ERROR', 'Error al cancelar orden.'));
    }
  },

  async getOrders(tenantId: string, status?: PurchaseOrder['status']): Promise<Result<PurchaseOrderWithItems[], AppError>> {
    if (isDbClosing()) return failure({ message: 'Base de datos cerrando', code: 'DB_CLOSING' } as AppError);
    const db = getDb();
    let rows = await db.purchaseOrders
      .where({ tenantId })
      .filter((o) => !o.deletedAt)
      .toArray();

    if (rows.length === 0) {
      const networkCheck = requireNetwork();
      if (!networkCheck.ok) return success([]);
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('tenant_id', tenantUuid)
        .is('deleted_at', null);

      if (!error && data && data.length > 0) {
        for (const o of data) {
          await db.purchaseOrders.put({
            id: o.id,
            tenantId,
            supplierId: o.supplier_id,
            status: o.status,
            totalUsd: o.total_usd,
            notes: o.notes,
            createdBy: o.created_by,
            createdAt: o.created_at,
            updatedAt: o.updated_at,
            paymentStatus: o.payment_status,
            paidAt: o.paid_at,
            paidAmountUsd: o.paid_amount_usd ? Number(o.paid_amount_usd) : undefined,
          });
        }

        const { data: itemsData, error: itemsError } = await supabase
          .from('purchase_order_items')
          .select('*')
          // PLAN-111 (#6): tenantUuid (UUID), no tenantId (slug) — el column es uuid
          .eq('tenant_id', tenantUuid)
          .is('deleted_at', null);

        if (!itemsError && itemsData && itemsData.length > 0) {
          for (const item of itemsData) {
            // Dexie acepta campos extra aunque no estén en la interfaz TS
            await db.purchaseOrderItems.put({
              id: item.id,
              orderId: item.order_id,
              productId: item.product_id,
              productName: item.product_name,
              quantity: item.quantity,
              costUsdPerUnit: item.cost_usd_per_unit,
              receivedQuantity: item.received_quantity,
              totalUsd: item.total_usd,
              presentationId: item.presentation_id as string | undefined,
              unitMultiplier: (item.unit_multiplier as number) ?? 1,
              createdAt: item.created_at,
            } as unknown as DexiePurchaseOrderItem);
          }
        }

        rows = await db.purchaseOrders.where({ tenantId }).filter((o) => !o.deletedAt).toArray();
      }
    }

    const supplierRows = await db.suppliers.where({ tenantId }).filter((s) => !s.deletedAt).toArray();
    const supplierMap = new Map(supplierRows.map((s) => [s.id, s.name]));

    const result: PurchaseOrderWithItems[] = [];
    for (const row of rows) {
      if (status && row.status !== status) continue;
      const items = await db.purchaseOrderItems.where({ orderId: row.id }).toArray();
      result.push({
        ...toOrder(row as unknown as Record<string, unknown>),
        items: items.map((i) => toOrderItem(i as unknown as Record<string, unknown>)),
        supplierName: supplierMap.get(row.supplierId),
      });
    }

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return success(result);
  },

  async getOrderById(id: string, tenantId: string): Promise<Result<PurchaseOrderWithItems, AppError>> {
    try {
      const db = getDb();
      const order = await db.purchaseOrders.where({ id }).filter((o) => o.tenantId === tenantId && !o.deletedAt).first();
      if (!order) {
        return failure(new AppError(PurchaseErrors.ORDER_NOT_FOUND, 'Orden no encontrada.'));
      }

      const items = await db.purchaseOrderItems.where({ orderId: id }).toArray();
      const supplier = await db.suppliers.get(order.supplierId);

      return success({
        ...toOrder(order as unknown as Record<string, unknown>),
        items: items.map((i) => toOrderItem(i as unknown as Record<string, unknown>)),
        supplierName: supplier?.name,
      });
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en getOrderById:', err);
      return failure(new AppError('ORDER_FETCH_ERROR', 'Error al obtener la orden.'));
    }
  },

  async getPriceHistory(
    supplierId: string,
    productId: string,
    tenantId: string,
  ): Promise<Result<Array<{ date: string; quantity: number; costPerUnit: number; totalUsd: number; orderId: string }>, AppError>> {
    try {
      const db = getDb();
      const orders = await db.purchaseOrders
        .where({ tenantId })
        .filter((o) => !o.deletedAt && o.supplierId === supplierId)
        .toArray();
      const orderIds = new Set(orders.map((o) => o.id));

      const allItems = await db.purchaseOrderItems
        .where({ tenantId })
        .filter((item) => !item.deletedAt && item.productId === productId && orderIds.has(item.orderId))
        .toArray();

      const result = allItems
        .map((item) => ({
          date: item.createdAt,
          quantity: item.quantity,
          costPerUnit: item.costUsdPerUnit,
          totalUsd: item.totalUsd,
          orderId: item.orderId,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return success(result);
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en getPriceHistory:', err);
      return failure(new AppError('PRICE_HISTORY_ERROR', 'Error al obtener historial de precios.'));
    }
  },

  async paySupplierDebt(
    supplierId: string,
    purchaseOrderId: string,
    amountUsd: number,
    paymentMethod: string,
    tenantId: string,
    exchangeRate: number,
    reference?: string,
    notes?: string,
  ): Promise<Result<{ paymentId: string; newBalance: number; newOrderPaidAmount: number }, AppError>> {
    const _paySession = useAuthStore.getState().session;
    if (!_paySession || !hasActionPermission(_paySession, 'purchases', 'update')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }

    const db = getDb();
    const now = new Date().toISOString();
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

    const paymentMethodValidation = SupplierPaymentMethodSchema.safeParse(paymentMethod);
    if (!paymentMethodValidation.success) {
      return failure(new AppError(PurchaseErrors.INVALID_PAYMENT_METHOD, `Método de pago inválido: ${paymentMethodValidation.error.issues.map(i => i.message).join('; ')}`));
    }

    if (amountUsd <= 0) return failure(new AppError('INVALID_AMOUNT', 'El monto del pago debe ser mayor a 0.'));

    const supplier = await db.suppliers
      .where({ id: supplierId })
      .filter((s) => s.tenantId === tenantId && !s.deletedAt)
      .first();
    if (!supplier) return failure(new AppError(PurchaseErrors.SUPPLIER_NOT_FOUND, 'Proveedor no encontrado.'));
    if ((supplier.balance || 0) <= 0) return failure(new AppError(PurchaseErrors.SUPPLIER_NO_DEBT, 'Este proveedor no tiene deuda pendiente.'));
    if (amountUsd > (supplier.balance || 0)) return failure(new AppError(PurchaseErrors.PAYMENT_EXCEEDS_DEBT, `El monto ($${amountUsd.toFixed(2)}) excede la deuda ($${supplier.balance.toFixed(2)}).`));

    const order = await db.purchaseOrders
      .where({ id: purchaseOrderId })
      .filter((o) => o.tenantId === tenantId && !o.deletedAt)
      .first();
    if (!order) return failure(new AppError('ORDER_NOT_FOUND', 'Orden no encontrada.'));
    if (order.paymentStatus === 'paid') return failure(new AppError(PurchaseErrors.ORDER_ALREADY_PAID, 'Esta orden ya fue pagada completamente.'));

    const orderPendingAmount = (order.totalUsd || 0) - (order.paidAmountUsd || 0);
    if (amountUsd > orderPendingAmount) return failure(new AppError(PurchaseErrors.PAYMENT_EXCEEDS_ORDER_BALANCE, `El monto ($${amountUsd.toFixed(2)}) excede el saldo pendiente de la orden ($${orderPendingAmount.toFixed(2)}).`));

    const paymentId = generateId();
    const amountBs = preciseRound(amountUsd * exchangeRate, 2);
    const newBalance = preciseRound(Math.max(0, (supplier.balance || 0) - amountUsd), 2);
    const newOrderPaidAmount = preciseRound((order.paidAmountUsd || 0) + amountUsd, 2);
    const isFullPayment = (order.totalUsd || 0) - newOrderPaidAmount <= 0.01;

    try {
      await db.transaction('rw', [
        db.supplierPayments, db.suppliers, db.purchaseOrders,
        db.expenses, db.syncQueue, db.outbox,
      ], async (tx) => {
        await tx.table('supplierPayments').add({
          id: paymentId, tenantId, supplierId, purchaseOrderId,
          amountUsd: preciseRound(amountUsd, 2), amountBs,
          paymentMethod, exchangeRate,
          reference: reference?.trim() || undefined,
          notes: notes?.trim() || undefined,
          createdAt: now,
        });

        await tx.table('suppliers').update(supplierId, {
          balance: isFullPayment ? 0 : newBalance,
        });

        const updateData: Record<string, unknown> = {
          paidAmountUsd: newOrderPaidAmount,
        };
        if (isFullPayment) {
          updateData.paymentStatus = 'paid';
          updateData.paidAt = now;
        } else {
          updateData.paymentStatus = 'partially_paid';
        }
        await tx.table('purchaseOrders').update(purchaseOrderId, updateData);

        if (isFullPayment) {
          const expense = await tx.table('expenses')
            .where({ purchaseOrderId })
            .filter((e: Record<string, unknown>) => !e.deletedAt)
            .first();
          if (expense) {
            const expenseId = expense.id as string;
            await tx.table('expenses').update(expenseId, { status: 'paid' });
            await syncQueue.enqueue('expenses', 'UPDATE', expenseId, toSnake({
              id: expenseId, status: 'paid', updated_at: now,
            } as unknown as Record<string, unknown>), tenantId);
          }
        }

        await syncQueue.enqueue('supplier_payments', 'CREATE', paymentId, toSnake({
          id: paymentId,
          tenant_id: tenantUuid,
          supplier_id: supplierId,
          purchase_order_id: purchaseOrderId,
          amount_usd: preciseRound(amountUsd, 2),
          amount_bs: amountBs,
          payment_method: paymentMethod,
          exchange_rate: exchangeRate,
          reference: reference?.trim() || null,
          notes: notes?.trim() || null,
          created_at: now,
        } as unknown as Record<string, unknown>), tenantId);

        await syncQueue.enqueue('suppliers', 'UPDATE', supplierId, toSnake({
          id: supplierId,
          balance: isFullPayment ? 0 : newBalance,
          updated_at: now,
        } as unknown as Record<string, unknown>), tenantId);

        await syncQueue.enqueue('purchase_orders', 'UPDATE', purchaseOrderId, toSnake({
          id: purchaseOrderId,
          payment_status: isFullPayment ? 'paid' : 'partially_paid',
          paid_at: isFullPayment ? now : null,
          paid_amount_usd: newOrderPaidAmount,
        } as unknown as Record<string, unknown>), tenantId);

        await outboxService.enqueue('SUPPLIER.PAYMENT_CREATED', PURCHASES_MODULE, {
          supplierId, purchaseOrderId, paymentId,
          amountUsd: preciseRound(amountUsd, 2),
          tenantSlug: tenantId,
        }, tx);

        if (isFullPayment) {
          await outboxService.enqueue('EXPENSE.UPDATED', PURCHASES_MODULE, {
            purchaseOrderId, status: 'paid',
          }, tx);
        }
      });

      await logAuditEventOnly({
        eventName: 'SUPPLIER.PAYMENT_CREATED',
        module: PURCHASES_MODULE,
        payload: { supplierId, purchaseOrderId, paymentId, amountUsd: preciseRound(amountUsd, 2) },
        context: { tenantId },
      });

      return success({ paymentId, newBalance: isFullPayment ? 0 : newBalance, newOrderPaidAmount });
    } catch (err) {
      if (err instanceof AppError) return failure(err);
      logger.error(PURCHASES_MODULE, 'Error en paySupplierDebt:', err);
      return failure(new AppError('PAYMENT_FAILED', 'Error al registrar el pago al proveedor.'));
    }
  },

  async reconcileSupplierBalance(
    supplierId: string,
    tenantId: string,
  ): Promise<Result<{ corrected: boolean; previousBalance: number; actualBalance: number }, AppError>> {
    const _reconSession = useAuthStore.getState().session;
    if (!_reconSession || !hasActionPermission(_reconSession, 'purchases', 'update')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }

    const db = getDb();

    const supplier = await db.suppliers
      .where({ id: supplierId })
      .filter((s) => s.tenantId === tenantId && !s.deletedAt)
      .first();
    if (!supplier) return failure(new AppError(PurchaseErrors.SUPPLIER_NOT_FOUND, 'Proveedor no encontrado.'));

    const orders = await db.purchaseOrders
      .where({ supplierId })
      .filter((o) => o.tenantId === tenantId && !o.deletedAt && o.status !== 'cancelled')
      .toArray();

    const actualBalance = orders.reduce((sum, o) => {
      const total = o.totalUsd || 0;
      const paid = o.paidAmountUsd || 0;
      return sum + Math.max(0, total - paid);
    }, 0);
    const roundedActual = preciseRound(actualBalance, 2);
    const previousBalance = supplier.balance || 0;

    if (Math.abs(roundedActual - previousBalance) > 0.01) {
      await db.suppliers.update(supplierId, { balance: roundedActual });
      await syncQueue.enqueue('suppliers', 'UPDATE', supplierId, toSnake({
        ...supplier,
        balance: roundedActual,
      } as unknown as Record<string, unknown>), tenantId);
      logger.warn(PURCHASES_MODULE, 'supplier.balance corregido', { supplierId, previous: previousBalance, actual: roundedActual });
      return success({ corrected: true, previousBalance, actualBalance: roundedActual });
    }

    return success({ corrected: false, previousBalance, actualBalance: previousBalance });
  },

  async getPendingPayables(tenantId: string): Promise<number> {
    const db = getDb();
    const suppliers = await db.suppliers
      .where({ tenantId })
      .filter((s) => !s.deletedAt && (s.balance || 0) > 0)
      .toArray();
    const balanceSum = suppliers.reduce((sum, s) => sum + (s.balance || 0), 0);

    const orders = await db.purchaseOrders
      .where({ tenantId })
      .filter((o) => !o.deletedAt && o.status !== 'cancelled')
      .toArray();
    const orderTotal = orders.reduce((sum, o) => {
      const total = o.totalUsd || 0;
      const paid = o.paidAmountUsd || 0;
      return sum + Math.max(0, total - paid);
    }, 0);
    const roundedOrderTotal = preciseRound(orderTotal, 2);
    const roundedBalanceSum = preciseRound(balanceSum, 2);
    if (Math.abs(roundedOrderTotal - roundedBalanceSum) > 0.01) {
      logger.warn(PURCHASES_MODULE, 'getPendingPayables: supplier.balance mismatch',
        { balanceSum: roundedBalanceSum, orderTotal: roundedOrderTotal });
    }

    return roundedBalanceSum;
  },
};
