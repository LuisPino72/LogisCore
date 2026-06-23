import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb, isDbClosing, type DexiePurchaseOrderItem } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { PurchaseErrors } from '../../../specs/purchases/errors';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderWithItems,
  CreatePurchaseOrderInput,
} from '../../../specs/purchases';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useAuthStore } from '../../auth/stores/authStore';

const PURCHASES_MODULE = 'PURCHASES';

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

export async function createOrder(
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

  const supplier = await db.suppliers.where({ id: input.supplierId }).filter((s) => s.tenantId === tenantId && !s.deletedAt).first();
  if (!supplier) {
    return failure(new AppError(PurchaseErrors.SUPPLIER_NOT_FOUND, 'El proveedor seleccionado no existe.'));
  }

  const productIds = input.items.map((i) => i.productId);
  if (new Set(productIds).size !== productIds.length) {
    return failure(new AppError('PURCHASE_DUPLICATE_PRODUCTS', 'No puede haber dos items del mismo producto en la orden.'));
  }

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
    unitMultiplier: item.unitMultiplier ?? 1,
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
}

export async function updateOrder(
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

  const productIds = input.items.map((i) => i.productId);
  if (new Set(productIds).size !== productIds.length) {
    return failure(new AppError('PURCHASE_DUPLICATE_PRODUCTS', 'No puede haber dos items del mismo producto en la orden.'));
  }

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
    unitMultiplier: item.unitMultiplier ?? 1,
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
}

export async function softDeleteOrder(id: string, tenantId: string): Promise<Result<void, AppError>> {
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
}

export async function confirmOrder(id: string, tenantId: string): Promise<Result<PurchaseOrder, AppError>> {
  try {
    const _session = useAuthStore.getState().session;
    if (!_session || !hasActionPermission(_session, 'purchases', 'update')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();
    const order = await db.purchaseOrders.where({ id }).filter((o) => o.tenantId === tenantId && !o.deletedAt).first();
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
}

export async function cancelOrder(id: string, tenantId: string): Promise<Result<PurchaseOrder, AppError>> {
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
}

export async function getOrders(tenantId: string, status?: PurchaseOrder['status']): Promise<Result<PurchaseOrderWithItems[], AppError>> {
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
        .eq('tenant_id', tenantUuid)
        .is('deleted_at', null);

      if (!itemsError && itemsData && itemsData.length > 0) {
        for (const item of itemsData) {
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
}

export async function getOrderById(id: string, tenantId: string): Promise<Result<PurchaseOrderWithItems, AppError>> {
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
}

export async function getPriceHistory(
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
}
