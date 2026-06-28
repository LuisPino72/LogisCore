import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { logger } from '../../../lib/logger';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';

export async function getPendingPayables(tenantId: string): Promise<number> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'reports', 'read')) {
    return 0;
  }
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
    logger.warn('Reports', 'getPendingPayables: supplier.balance mismatch',
      { balanceSum: roundedBalanceSum, orderTotal: roundedOrderTotal });
  }

  return roundedOrderTotal;
}
