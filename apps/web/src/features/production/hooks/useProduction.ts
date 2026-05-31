import { useEffect, useRef, useCallback } from 'react';
import { EventBus } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { useProductionStore } from '../stores/productionStore';

export function useProduction(tenantId: string | null) {
  const store = useProductionStore();
  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);

  const doFetch = useCallback(async (silent = false) => {
    if (!tenantId) return;
    await Promise.all([
      store.fetchRecipes(tenantId, undefined, silent),
      store.fetchOrders(tenantId, undefined, silent),
    ]);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || initialFetchDone.current) return;
    initialFetchDone.current = true;
    doFetch();
  }, [tenantId, doFetch]);

  useEffect(() => {
    if (!tenantId) return;

    const sub1 = EventBus.on('SYNC.REFRESH_TABLE', (payload: unknown) => {
      const { table } = payload as { table?: string };
      if (!table || table === '*' || ['recipes', 'recipe_lines', 'production_orders', 'products'].includes(table)) {
        doFetch(true);
      }
    });

    const sub2 = EventBus.on('PRODUCTION.COMPLETED', () => {
      doFetch(true);
    });

    const sub3 = EventBus.on('PRODUCTION.ORDER_CANCELLED', () => {
      doFetch(true);
    });

    return () => {
      EventBus.off(sub1);
      EventBus.off(sub2);
      EventBus.off(sub3);
    };
  }, [tenantId, doFetch]);

  const refresh = useCallback(() => {
    initialFetchDone.current = false;
    doFetch(true);
  }, [doFetch]);

  return {
    ...store,
    refresh,
    userId: session?.userId,
    role: session?.role,
  };
}
