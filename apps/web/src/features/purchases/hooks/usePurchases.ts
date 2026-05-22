import { useEffect, useRef, useCallback } from 'react';
import { EventBus } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { usePurchaseStore } from '../stores/purchaseStore';
import type { PurchaseOrderStatus } from '../../../specs/purchases';

export function usePurchases(tenantId: string | null) {
  const store = usePurchaseStore();
  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);

  const doFetch = useCallback(async (status?: PurchaseOrderStatus, silent = false) => {
    if (!tenantId) return;
    await Promise.all([
      store.fetchSuppliers(tenantId, silent),
      store.fetchOrders(tenantId, status, silent),
    ]);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || initialFetchDone.current) return;
    initialFetchDone.current = true;
    doFetch();
  }, [tenantId, doFetch]);

  useEffect(() => {
    if (!tenantId) return;

    const sub = EventBus.on('SYNC.REFRESH_TABLE', (payload: unknown) => {
      const { table } = payload as { table?: string };
      if (!table || ['purchase_orders', 'purchase_order_items', 'suppliers', 'products', 'inventory_lots'].includes(table)) {
        doFetch(undefined, true);
      }
    });

    return () => {
      EventBus.off(sub);
    };
  }, [tenantId, doFetch]);

  const refresh = useCallback(() => {
    initialFetchDone.current = false;
    doFetch();
  }, [doFetch]);

  return {
    ...store,
    refresh,
    userId: session?.userId,
    role: session?.role,
  };
}
