import { useEffect, useRef, useCallback } from 'react';
import { usePosStore } from '../stores/posStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { EventBus, SystemEvents } from '@logiscore/core';

export function usePos(tenantId: string | null) {
  const store = usePosStore();
  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doRefresh = useCallback(async () => {
    if (!tenantId) return;
    await Promise.all([
      store.fetchProducts(tenantId),
      store.fetchCashRegister(tenantId),
      store.fetchExchangeRate(tenantId),
    ]);
  }, [tenantId, store]);

  useEffect(() => {
    if (!tenantId || initialFetchDone.current) return;
    initialFetchDone.current = true;
    doRefresh();
    store.fetchParkedCarts(tenantId);
  }, [tenantId, doRefresh, store]);

  useEffect(() => {
    const subs: ReturnType<typeof EventBus.on>[] = [];

    subs.push(
      EventBus.on('SALE.COMPLETED', () => {
        doRefresh();
      }),
    );

    subs.push(
      EventBus.on('INVENTORY.UPDATED', () => {
        if (tenantId) store.fetchProducts(tenantId);
      }),
    );

    subs.push(
      EventBus.on('BOX.OPENED', () => {
        if (tenantId) store.fetchCashRegister(tenantId);
      }),
    );

    subs.push(
      EventBus.on('BOX.CLOSED', () => {
        if (tenantId) store.fetchCashRegister(tenantId);
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, (payload: unknown) => {
        const { table } = payload as { table?: string };
        if (table === 'products' && tenantId) {
          store.fetchProducts(tenantId);
        }
        if (table === 'cash_registers' && tenantId) {
          store.fetchCashRegister(tenantId);
        }
      }),
    );

    return () => subs.forEach((s) => EventBus.off(s));
  }, [tenantId, store, doRefresh]);

  const search = useCallback(
    (query: string) => {
      store.setSearchQuery(query);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        if (tenantId) store.fetchProducts(tenantId);
      }, 300);
    },
    [tenantId, store],
  );

  return {
    ...store,
    search,
    refresh: doRefresh,
    userId: session?.userId ?? null,
    role: session?.role ?? null,
  };
}
