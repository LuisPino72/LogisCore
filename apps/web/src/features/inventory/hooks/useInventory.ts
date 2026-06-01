import { useEffect, useRef, useCallback } from 'react';
import { EventBus } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { useInventoryStore } from '../stores/inventoryStore';
import type { ProductFilters, TabKey } from '../types';

function buildFilters(state: ReturnType<typeof useInventoryStore.getState>, filters?: ProductFilters): ProductFilters | undefined {
  if (filters) return filters;
  const tabState = state.tabStates[state.activeTab];
  const q = tabState?.searchQuery;
  const cat = tabState?.filterCategory;
  if (!q && !cat) return undefined;
  return { query: q || undefined, categoryId: cat || undefined };
}

const DEBOUNCE_MS = 300;

export function useInventory(tenantId: string | null) {
  const store = useInventoryStore();
  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFetch = useCallback(async (filters?: ProductFilters, silent = false) => {
    if (!tenantId) return;
    const effectiveFilters = buildFilters(useInventoryStore.getState(), filters);
    await Promise.all([
      store.fetchProducts(tenantId, effectiveFilters, silent),
      store.fetchCategories(tenantId, silent),
      store.fetchLowStock(tenantId, silent),
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
      if (!tenantId) return;
      const { table } = payload as { table?: string };
      if (!table || table === '*' || ['products', 'categories', 'inventory_movements', 'inventory_lots'].includes(table)) {
        doFetch(undefined, true);
      }
    });

    const sub2 = EventBus.on('SALE.COMPLETED', () => {
      if (!tenantId) return;
      doFetch(undefined, true);
    });

    const sub3 = EventBus.on('PURCHASE.RECEIVED', () => {
      if (!tenantId) return;
      doFetch(undefined, true);
    });

    return () => {
      EventBus.off(sub1);
      EventBus.off(sub2);
      EventBus.off(sub3);
    };
  }, [tenantId, doFetch]);

  const search = useCallback((query: string, categoryId?: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    store.setSearchQuery(query);
    store.saveTabState(store.activeTab as TabKey, { searchQuery: query, filterCategory: categoryId || '' });

    debounceTimer.current = setTimeout(() => {
      if (!tenantId) return;
      store.fetchProducts(tenantId, { query: query || undefined, categoryId });
    }, DEBOUNCE_MS);
  }, [tenantId]);

  const refresh = useCallback(() => {
    initialFetchDone.current = false;
    doFetch(undefined, true);
  }, [doFetch]);

  return {
    ...store,
    search,
    refresh,
    saveTabState: store.saveTabState,
    userId: session?.userId,
    role: session?.role,
  };
}
