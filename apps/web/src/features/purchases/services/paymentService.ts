import { type Result, success, failure, AppError, SystemEvents } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { logger } from '../../../lib/logger';
import { PurchaseErrors } from '../../../specs/purchases/errors';
import { SupplierPaymentMethodSchema } from '../../../specs/purchases';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { getPermissionMessage } from '../../auth/permissions/messages';
import { useAuthStore } from '../../auth/stores/authStore';

const PURCHASES_MODULE = 'PURCHASES';

export async function paySupplierDebt(
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
    return failure(new AppError('AUTH_SCOPE_DENIED', getPermissionMessage('purchases', 'update')));
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
        } else {
          logger.warn(PURCHASES_MODULE, 'No se encontró expense COMPRA_INVENTARIO para orden', { purchaseOrderId });
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

      await outboxService.enqueue(SystemEvents.SUPPLIER_PAYMENT_CREATED, PURCHASES_MODULE, {
        supplierId, purchaseOrderId, paymentId,
        amountUsd: preciseRound(amountUsd, 2),
        tenantSlug: tenantId,
      }, tx);

      if (isFullPayment) {
        await outboxService.enqueue(SystemEvents.EXPENSES_UPDATED, PURCHASES_MODULE, {
          purchaseOrderId, status: 'paid',
        }, tx);
      }
    });

    await logAuditEventOnly({
      eventName: SystemEvents.SUPPLIER_PAYMENT_CREATED,
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
}

export async function reconcileSupplierBalance(
  supplierId: string,
  tenantId: string,
): Promise<Result<{ corrected: boolean; previousBalance: number; actualBalance: number }, AppError>> {
  const _reconSession = useAuthStore.getState().session;
  if (!_reconSession || !hasActionPermission(_reconSession, 'purchases', 'update')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', getPermissionMessage('purchases', 'update')));
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
}

export async function getSupplierPayments(tenantId: string, supplierId: string): Promise<Array<{
  id: string; amountUsd: number; amountBs: number; paymentMethod: string;
  reference?: string; createdAt: string; purchaseOrderId: string;
}>> {
  const db = getDb();
  const rows = await db.supplierPayments
    .where({ tenantId, supplierId })
    .filter((p) => !p.deletedAt)
    .toArray();
  return rows
    .map((r) => ({
      id: r.id, amountUsd: r.amountUsd, amountBs: r.amountBs,
      paymentMethod: r.paymentMethod, reference: r.reference,
      createdAt: r.createdAt, purchaseOrderId: r.purchaseOrderId,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPendingPayables(tenantId: string): Promise<number> {
  const db = getDb();
  const suppliers = await db.suppliers
    .where({ tenantId })
    .filter((s) => !s.deletedAt && (s.balance || 0) > 0)
    .toArray();
  const balanceSum = suppliers.reduce((sum, s) => sum + (s.balance || 0), 0);

  const orders = await db.purchaseOrders
    .where({ tenantId })
    .filter((o) => !o.deletedAt && (o.status === 'received' || o.status === 'partially_received'))
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
}
