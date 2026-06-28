import { type Result, success, failure, AppError, SystemEvents } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb, type DexieExpense } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { PurchaseErrors } from '../../../specs/purchases/errors';
import type { PurchaseOrder, ReceivePurchaseOrderInput } from '../../../specs/purchases';
import { convertToStorage, unitToStorageType } from '../../inventory/types';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { getPermissionMessage } from '../../auth/permissions/messages';
import { useAuthStore } from '../../auth/stores/authStore';

const PURCHASES_MODULE = 'PURCHASES';

export async function receiveOrder(
  id: string,
  input: ReceivePurchaseOrderInput,
  tenantId: string,
  userId: string,
  exchangeRate: number,
): Promise<Result<PurchaseOrder, AppError>> {
  const _session = useAuthStore.getState().session;
  if (!_session || !hasActionPermission(_session, 'purchases', 'receive_order')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', getPermissionMessage('purchases', 'receive_order')));
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

  const supplier = await db.suppliers.where({ id: order.supplierId }).filter((s) => s.tenantId === tenantId && !s.deletedAt).first();
  if (!supplier) {
    return failure(new AppError(PurchaseErrors.SUPPLIER_NOT_FOUND, 'El proveedor de la orden ya no existe.'));
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
        const item = await db.purchaseOrderItems.get(rec.itemId);
        if (!item) continue;

        const newReceivedQty = item.receivedQuantity + rec.receivedQuantity;
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
          const product = await db.products.where({ id: item.productId, tenantId }).first();
          if (!product) continue;

          const storageQty = product.isWeighted
            ? convertToStorage(rec.receivedQuantity, unitToStorageType(product.isWeighted, product.unit))
            : rec.receivedQuantity;

          const effectiveQty = storageQty * (item.unitMultiplier ?? 1);

          const previousStock = product.stock;
          const newStock = previousStock + effectiveQty;

          const previousCostStorage = product.isWeighted
            ? (product.costPrice ?? 0) / 1000
            : (product.costPrice ?? 0);
          const divisor = item.unitMultiplier ?? 1;
          const itemCostStorage = product.isWeighted
            ? ((item.costUsdPerUnit || 0) / divisor) / 1000
            : (item.costUsdPerUnit || 0) / divisor;

          const totalLotCost = (previousStock * previousCostStorage) + (effectiveQty * itemCostStorage);
          const newCostPriceStorage = newStock > 0 ? preciseRound(totalLotCost / newStock, 4) : itemCostStorage;

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
      await outboxService.enqueue(SystemEvents.PURCHASE_RECEIVED, PURCHASES_MODULE, { orderId: id, status: newStatus });

      let totalReceivedUsd = 0;
      for (const rec of input.items) {
        const freshItem = await db.purchaseOrderItems.get(rec.itemId);
        if (!freshItem || rec.receivedQuantity <= 0) continue;
        totalReceivedUsd += preciseRound(rec.receivedQuantity * (freshItem.costUsdPerUnit ?? 0), 2);
      }
      if (totalReceivedUsd > 0) {
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
            purchaseOrderId: id,
          };
          await db.expenses.add(expense);
          await syncQueue.enqueue('expenses', 'CREATE', expenseId, toSnake(expense as unknown as Record<string, unknown>), tenantId);
          await outboxService.enqueue(SystemEvents.EXPENSES_CREATED, PURCHASES_MODULE, { expenseId, amountUsd: totalReceivedUsd, category: 'COMPRA_INVENTARIO' });
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

    // @ts-expect-error - syncEngine está disponible globalmente
    syncEngine.pushNow().catch((err: unknown) => logger.warn('Receiving', 'pushNow failed:', err));

    await logAuditEventOnly({
      eventName: SystemEvents.PURCHASE_RECEIVED,
      module: PURCHASES_MODULE,
      payload: { orderId: id, status: newStatus },
      context: { userId, tenantId },
    });
    return success(toOrder({ ...order, status: newStatus, updatedAt: now } as unknown as Record<string, unknown>));
  } catch (err) {
    logger.error('receiveOrder', 'Error:', err);
    return failure(new AppError('PURCHASE_RECEIVE_ERROR', 'Error al recibir orden.'));
  }
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
