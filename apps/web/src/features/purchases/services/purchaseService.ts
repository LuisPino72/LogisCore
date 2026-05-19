import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb, type DexiePurchaseOrderItem } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { emitWithAudit } from '../../../services/audit/emitWithAudit';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
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
import { convertToStorage } from '../../inventory/types';

const PURCHASES_MODULE = 'PURCHASES';

function toSupplier(raw: Record<string, unknown>): Supplier {
  return {
    id: raw.id as string,
    name: raw.name as string,
    phone: raw.phone as string | undefined,
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
  };
}

function toOrderItem(raw: Record<string, unknown>): PurchaseOrderItem {
  return {
    id: raw.id as string,
    orderId: raw.orderId as string,
    productId: raw.productId as string,
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
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    const supplier: Supplier = {
      id,
      name: input.name,
      phone: input.phone,
      createdAt: now,
    };

    try {
      await db.transaction('rw', [db.suppliers, db.syncQueue, db.outbox], async () => {
        await db.suppliers.add({ ...supplier, tenantId, updatedAt: now });
        await syncQueue.enqueue('suppliers', 'CREATE', id, toSnake({ ...supplier, tenantId } as unknown as Record<string, unknown>), tenantId);
        await outboxService.enqueue('PURCHASE.SUPPLIER_CREATED', PURCHASES_MODULE, { supplierId: id, name: input.name });
      });
      await emitWithAudit('PURCHASE.SUPPLIER_CREATED', PURCHASES_MODULE, { supplierId: id, name: input.name }, { userId, tenantId });
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
    const db = getDb();
    const existing = await db.suppliers.get(id);
    if (!existing) {
      return failure(new AppError(PurchaseErrors.SUPPLIER_NOT_FOUND, 'Proveedor no encontrado.'));
    }
    const updated = { ...existing, ...input };
    await db.transaction('rw', [db.suppliers, db.syncQueue, db.outbox], async () => {
      await db.suppliers.put(updated);
      await syncQueue.enqueue('suppliers', 'UPDATE', id, toSnake(updated as unknown as Record<string, unknown>), tenantId);
      await outboxService.enqueue('PURCHASE.SUPPLIER_UPDATED', PURCHASES_MODULE, { supplierId: id });
    });
    await emitWithAudit('PURCHASE.SUPPLIER_UPDATED', PURCHASES_MODULE, { supplierId: id }, { tenantId });
    return success(toSupplier(updated as unknown as Record<string, unknown>));
  },

  async softDeleteSupplier(id: string, tenantId: string): Promise<Result<void, AppError>> {
    const db = getDb();
    const supplier = await db.suppliers.get(id);
    if (!supplier) {
      return failure(new AppError(PurchaseErrors.SUPPLIER_NOT_FOUND, 'Proveedor no encontrado.'));
    }

    const ordersWithSupplier = await db.purchaseOrders
      .where({ tenantId })
      .filter((o) => o.supplierId === id && !o.deletedAt)
      .count();

    if (ordersWithSupplier > 0) {
      return failure(new AppError(PurchaseErrors.SUPPLIER_HAS_ORDERS, `No se puede eliminar: tiene ${ordersWithSupplier} orden(es) asociada(s).`));
    }

    const deletedAt = new Date().toISOString();
    await db.transaction('rw', [db.suppliers, db.syncQueue, db.outbox], async () => {
      await db.suppliers.update(id, { deletedAt });
      await syncQueue.enqueue('suppliers', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
      await outboxService.enqueue('PURCHASE.SUPPLIER_DELETED', PURCHASES_MODULE, { supplierId: id });
    });
    await emitWithAudit('PURCHASE.SUPPLIER_DELETED', PURCHASES_MODULE, { supplierId: id }, { tenantId });
    return success(undefined);
  },

  async getSuppliers(tenantId: string): Promise<Result<Supplier[], AppError>> {
    const db = getDb();
    let rows = await db.suppliers
      .where({ tenantId })
      .filter((s) => !s.deletedAt)
      .toArray();

    if (rows.length === 0) {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .is('deleted_at', null);

      if (!error && data && data.length > 0) {
        for (const s of data) {
          await db.suppliers.put({
            id: s.id,
            tenantId,
            name: s.name,
            phone: s.phone,
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
    const db = getDb();
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

      await emitWithAudit('PURCHASE.CREATED', PURCHASES_MODULE, { orderId: id, supplierId: input.supplierId, totalUsd }, { userId, tenantId });
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
    input: CreatePurchaseOrderInput,
  ): Promise<Result<PurchaseOrder, AppError>> {
    const db = getDb();
    const order = await db.purchaseOrders.get(id);
    if (!order || order.deletedAt) {
      return failure(new AppError(PurchaseErrors.ORDER_NOT_FOUND, 'Orden no encontrada.'));
    }
    if (order.status !== 'draft') {
      return failure(new AppError(PurchaseErrors.ORDER_INVALID_STATUS, 'Solo órdenes en borrador pueden editarse.'));
    }

    const now = new Date().toISOString();
    const totalUsd = input.items.reduce((sum, item) => sum + item.totalCostUsd, 0);

    const productMap = new Map<string, string>();
    for (const item of input.items) {
      const product = await db.products.get(item.productId);
      productMap.set(item.productId, product?.name ?? item.productId.slice(0, 8));
    }

    const newItems: PurchaseOrderItem[] = input.items.map((item) => ({
      id: generateId(),
      orderId: id,
      productId: item.productId,
      productName: productMap.get(item.productId) ?? '',
      quantity: item.quantity,
      costUsdPerUnit: preciseRound(item.totalCostUsd / item.quantity, 2),
      receivedQuantity: 0,
      totalUsd: item.totalCostUsd,
      createdAt: now,
    }));

    try {
      await db.transaction('rw', [db.purchaseOrders, db.purchaseOrderItems, db.syncQueue, db.outbox], async () => {
        const oldItems = await db.purchaseOrderItems.where({ orderId: id }).toArray();
        for (const old of oldItems) {
          await db.purchaseOrderItems.delete(old.id);
          await syncQueue.enqueue('purchase_order_items', 'DELETE', old.id, { id: old.id }, tenantId);
        }

        const updatedOrder = { ...order, supplierId: input.supplierId, totalUsd, notes: input.notes, updatedAt: now };
        await db.purchaseOrders.put(updatedOrder);
        await db.purchaseOrderItems.bulkAdd(newItems.map((i) => ({ ...i, tenantId })));

        await syncQueue.enqueue('purchase_orders', 'UPDATE', id, toSnake({ ...updatedOrder, tenantId } as unknown as Record<string, unknown>), tenantId);
        for (const item of newItems) {
          await syncQueue.enqueue('purchase_order_items', 'CREATE', item.id, toSnake({ ...item, tenantId } as unknown as Record<string, unknown>), tenantId);
        }
        await outboxService.enqueue('PURCHASE.UPDATED', PURCHASES_MODULE, { orderId: id });
      });

      await emitWithAudit('PURCHASE.UPDATED', PURCHASES_MODULE, { orderId: id }, { userId, tenantId });
      return success(toOrder({ ...order, totalUsd } as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(PURCHASES_MODULE, 'Error en updateOrder:', err);
      return failure(new AppError('PURCHASE_UPDATE_ERROR', 'Error al actualizar orden.'));
    }
  },

  async softDeleteOrder(id: string, tenantId: string): Promise<Result<void, AppError>> {
    const db = getDb();
    const order = await db.purchaseOrders.get(id);
    if (!order || order.deletedAt) {
      return failure(new AppError(PurchaseErrors.ORDER_NOT_FOUND, 'Orden no encontrada.'));
    }
    const deletedAt = new Date().toISOString();
    await db.transaction('rw', [db.purchaseOrders, db.syncQueue, db.outbox], async () => {
      await db.purchaseOrders.update(id, { deletedAt });
      await syncQueue.enqueue('purchase_orders', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
      await outboxService.enqueue('PURCHASE.DELETED', PURCHASES_MODULE, { orderId: id });
    });
    await emitWithAudit('PURCHASE.DELETED', PURCHASES_MODULE, { orderId: id }, { tenantId });
    return success(undefined);
  },

  async confirmOrder(id: string, tenantId: string): Promise<Result<PurchaseOrder, AppError>> {
    const db = getDb();
    const order = await db.purchaseOrders.get(id);
    if (!order || order.deletedAt) {
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
    await emitWithAudit('PURCHASE.CONFIRMED', PURCHASES_MODULE, { orderId: id }, { tenantId });
    return success(toOrder(updated as unknown as Record<string, unknown>));
  },

  async receiveOrder(
    id: string,
    input: ReceivePurchaseOrderInput,
    tenantId: string,
    userId: string,
  ): Promise<Result<PurchaseOrder, AppError>> {
    const db = getDb();
    const order = await db.purchaseOrders.get(id);
    if (!order || order.deletedAt) {
      return failure(new AppError(PurchaseErrors.ORDER_NOT_FOUND, 'Orden no encontrada.'));
    }
    if (order.status === 'received' || order.status === 'cancelled') {
      return failure(new AppError(PurchaseErrors.ORDER_ALREADY_RECEIVED, 'La orden ya fue recibida o cancelada.'));
    }
    if (order.status !== 'confirmed' && order.status !== 'partially_received') {
      return failure(new AppError(PurchaseErrors.ORDER_INVALID_STATUS, 'La orden debe estar confirmada para recibir.'));
    }

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

    try {
      await db.transaction('rw', [
        db.purchaseOrders,
        db.purchaseOrderItems,
        db.products,
        db.inventoryMovements,
        db.inventoryLots,
        db.syncQueue,
        db.outbox,
      ], async () => {
        for (const rec of input.items) {
          const item = itemMap.get(rec.itemId);
          if (!item) continue;

          const newReceivedQty = item.receivedQuantity + rec.receivedQuantity;
          await db.purchaseOrderItems.update(item.id, { receivedQuantity: newReceivedQty });
          await syncQueue.enqueue('purchase_order_items', 'UPDATE', item.id, toSnake({
            ...item,
            receivedQuantity: newReceivedQty,
          } as unknown as Record<string, unknown>), tenantId);

          if (rec.receivedQuantity > 0) {
            const product = await db.products.get(item.productId);
            if (!product || product.deletedAt) continue;

            const storageQty = product.isWeighted
              ? convertToStorage(rec.receivedQuantity, product.unit === 'lt' ? 'pesable_lt' : 'pesable_kg')
              : rec.receivedQuantity;

            const previousStock = product.stock;
            const newStock = previousStock + storageQty;

            const movementId = generateId();
            const movement = {
              id: movementId,
              tenantId,
              productId: item.productId,
              userId,
              type: 'purchase' as const,
              quantity: storageQty,
              previousStock,
              newStock,
              createdAt: now,
            };

            const lot = {
              id: generateId(),
              tenantId,
              productId: item.productId,
              quantityAdded: storageQty,
              remainingQuantity: storageQty,
              costUsdPerUnit: item.costUsdPerUnit,
              sourceMovementId: movementId,
              createdAt: now,
              updatedAt: now,
            };

            await db.products.update(item.productId, { stock: newStock });
            await db.inventoryMovements.add(movement);
            await db.inventoryLots.add(lot);

            await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
            await syncQueue.enqueue('inventory_lots', 'CREATE', lot.id, toSnake(lot as unknown as Record<string, unknown>), tenantId);
            await syncQueue.enqueue('products', 'UPDATE', item.productId, toSnake({
              ...product,
              stock: newStock,
            } as unknown as Record<string, unknown>), tenantId);
          }
        }

        const updatedOrder = { ...order, status: newStatus, updatedAt: now };
        await db.purchaseOrders.put(updatedOrder);
        await syncQueue.enqueue('purchase_orders', 'UPDATE', id, toSnake({ ...updatedOrder, tenantId } as unknown as Record<string, unknown>), tenantId);
        await outboxService.enqueue('PURCHASE.RECEIVED', PURCHASES_MODULE, { orderId: id, status: newStatus });
      });

      await emitWithAudit('PURCHASE.RECEIVED', PURCHASES_MODULE, { orderId: id, status: newStatus }, { userId, tenantId });
      return success(toOrder({ ...order, status: newStatus, updatedAt: now } as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error('receiveOrder', 'Error:', err);
      return failure(new AppError('PURCHASE_RECEIVE_ERROR', 'Error al recibir orden.'));
    }
  },

  async cancelOrder(id: string, tenantId: string): Promise<Result<PurchaseOrder, AppError>> {
    const db = getDb();
    const order = await db.purchaseOrders.get(id);
    if (!order || order.deletedAt) {
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
    await emitWithAudit('PURCHASE.CANCELLED', PURCHASES_MODULE, { orderId: id }, { tenantId });
    return success(toOrder(updated as unknown as Record<string, unknown>));
  },

  async getOrders(tenantId: string, status?: PurchaseOrder['status']): Promise<Result<PurchaseOrderWithItems[], AppError>> {
    const db = getDb();
    let rows = await db.purchaseOrders
      .where({ tenantId })
      .filter((o) => !o.deletedAt)
      .toArray();

    if (rows.length === 0) {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
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
          });
        }

        const { data: itemsData, error: itemsError } = await supabase
          .from('purchase_order_items')
          .select('*')
          .eq('tenant_id', tenantId)
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

    return success(result);
  },

  async getOrderById(id: string): Promise<Result<PurchaseOrderWithItems, AppError>> {
    const db = getDb();
    const order = await db.purchaseOrders.get(id);
    if (!order || order.deletedAt) {
      return failure(new AppError(PurchaseErrors.ORDER_NOT_FOUND, 'Orden no encontrada.'));
    }

    const items = await db.purchaseOrderItems.where({ orderId: id }).toArray();
    const supplier = await db.suppliers.get(order.supplierId);

    return success({
      ...toOrder(order as unknown as Record<string, unknown>),
      items: items.map((i) => toOrderItem(i as unknown as Record<string, unknown>)),
      supplierName: supplier?.name,
    });
  },
};
