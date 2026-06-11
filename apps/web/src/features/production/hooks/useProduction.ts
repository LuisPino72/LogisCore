import { useEffect, useRef, useCallback } from 'react';
import { EventBus } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { useProductionStore } from '../stores/productionStore';
import { useInventoryStore } from '../../inventory/stores/inventoryStore';

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
    await Promise.all([
      fetchRecipes(tenantId, undefined, silent),
      fetchOrders(tenantId, undefined, silent),
      fetchProducts(tenantId, undefined, silent),
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

    const sub4 = EventBus.on('PRODUCTION.CREATED', () => {
      doFetch(true);
    });

    // PRODUCTION-003 [Paso-2]: escuchar también el nuevo nombre semántico
    const sub4b = EventBus.on('PRODUCTION.RECIPE_CREATED', () => {
      doFetch(true);
    });

    const sub5 = EventBus.on('PRODUCTION.UPDATED', () => {
      doFetch(true);
    });

    const sub6 = EventBus.on('PRODUCTION.DELETED', () => {
      doFetch(true);
    });

    return () => {
      EventBus.off(sub1);
      EventBus.off(sub2);
      EventBus.off(sub3);
      EventBus.off(sub4);
      EventBus.off(sub4b);
      EventBus.off(sub5);
      EventBus.off(sub6);
    };
  }, [tenantId, doFetch]);

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
