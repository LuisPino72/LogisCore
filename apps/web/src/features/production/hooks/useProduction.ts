import { useEffect, useRef, useCallback } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { useProductionStore } from '../stores/productionStore';
import { useInventoryStore } from '../../inventory/stores/inventoryStore';
import { useDebouncedCallback } from '../../../common/hooks/useDebouncedCallback';
import { logger } from '../../../lib/logger';

export function useProduction(tenantId: string | null) {
  const recipes = useProductionStore((s) => s.recipes);
  const productionOrders = useProductionStore((s) => s.productionOrders);
  const loading = useProductionStore((s) => s.loading);
  const activeTab = useProductionStore((s) => s.activeTab);
  const setActiveTab = useProductionStore((s) => s.setActiveTab);
  const fetchRecipes = useProductionStore((s) => s.fetchRecipes);
  const fetchOrders = useProductionStore((s) => s.fetchOrders);
  const fetchProducts = useInventoryStore((s) => s.fetchProducts);
  // PLAN-115 (CODE-MIN-7): exponer cancelOrder para UI de historial
  const cancelOrder = useProductionStore((s) => s.cancelOrder);
  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);

  const doFetch = useCallback(async (silent = false) => {
    if (!tenantId) return;
    const results = await Promise.allSettled([
      fetchRecipes(tenantId, undefined, silent),
      fetchOrders(tenantId, undefined, silent),
      fetchProducts(tenantId, undefined, silent),
    ]);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.warn('useProduction', `doFetch[${i}] falló:`, r.reason);
      }
    });
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || initialFetchDone.current) return;
    initialFetchDone.current = true;
    doFetch();
  }, [tenantId, doFetch]);

  const refreshOnEvent = useDebouncedCallback(() => {
    if (!tenantId) return;
    doFetch(true);
  }, 300, 1000);

  useEffect(() => {
    if (!tenantId) return;

    const subs = [
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, (payload: unknown) => {
        const { table } = payload as { table?: string };
        if (!table || table === '*' || ['recipes', 'recipe_lines', 'production_orders', 'products'].includes(table)) {
          refreshOnEvent();
        }
      }),
      EventBus.on(SystemEvents.PRODUCTION_COMPLETED, refreshOnEvent),
      EventBus.on(SystemEvents.PRODUCTION_ORDER_CANCELLED, refreshOnEvent),
      EventBus.on(SystemEvents.PRODUCTION_RECIPE_CREATED, refreshOnEvent),
      EventBus.on(SystemEvents.PRODUCTION_UPDATED, refreshOnEvent),
      EventBus.on(SystemEvents.PRODUCTION_DELETED, refreshOnEvent),
      EventBus.on(SystemEvents.INVENTORY_UPDATED, refreshOnEvent),
      EventBus.on(SystemEvents.INVENTORY_ADJUSTMENT, refreshOnEvent),
      EventBus.on(SystemEvents.PURCHASE_RECEIVED, refreshOnEvent),
      EventBus.on(SystemEvents.EXCHANGE_RATE_UPDATED, refreshOnEvent),
      EventBus.on(SystemEvents.PRODUCTION_ASSEMBLY_CONSUMED, refreshOnEvent),
      EventBus.on(SystemEvents.ORDER_CREATED, refreshOnEvent),
      EventBus.on(SystemEvents.ORDER_STATUS_CHANGED, refreshOnEvent),
      EventBus.on(SystemEvents.ORDER_CANCELLED, refreshOnEvent),
    ];

    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, refreshOnEvent]);

  const refresh = useCallback(() => {
    initialFetchDone.current = false;
    doFetch(true);
  }, [doFetch]);

  return {
    recipes,
    productionOrders,
    loading,
    activeTab,
    setActiveTab,
    refresh,
    cancelOrder,
    userId: session?.userId,
    role: session?.role,
  };
}
