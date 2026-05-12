import { useEffect, useRef, useCallback } from 'react';
import { EventBus } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { useInventoryStore } from '../stores/inventoryStore';
import type { ProductFilters } from '../types';

const DEBOUNCE_MS = 300;

export function useInventory(tenantId: string | null) {
  const store = useInventoryStore();
  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFetch = useCallback(async (filters?: ProductFilters) => {
    if (!tenantId) return;
    await Promise.all([
      store.fetchProducts(tenantId, filters),
      store.fetchCategories(tenantId),
      store.fetchLowStock(tenantId),
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
      if (!table || ['products', 'categories', 'inventory_movements', 'inventory_lots'].includes(table)) {
        doFetch();
      }
    });

    const sub2 = EventBus.on('SALE.COMPLETED', () => {
      doFetch();
    });

    return () => {
      EventBus.off(sub1);
      EventBus.off(sub2);
    };
  }, [tenantId, doFetch]);

  const search = useCallback((query: string, categoryId?: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    store.setSearchQuery(query);

    debounceTimer.current = setTimeout(() => {
      if (!tenantId) return;
      store.fetchProducts(tenantId, { query: query || undefined, categoryId });
    }, DEBOUNCE_MS);
  }, [tenantId]);

  const refresh = useCallback(() => {
    initialFetchDone.current = false;
    doFetch();
  }, [doFetch]);

  return {
    ...store,
    search,
    refresh,
    userId: session?.userId,
    role: session?.role,
  };
}
