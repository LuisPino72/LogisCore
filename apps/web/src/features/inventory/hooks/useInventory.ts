import { useEffect, useRef, useCallback } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
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
  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);
  const loading = useInventoryStore((s) => s.loading);
  const activeTab = useInventoryStore((s) => s.activeTab);
  const tabStates = useInventoryStore((s) => s.tabStates);
  const setActiveTab = useInventoryStore((s) => s.setActiveTab);
  const saveTabState = useInventoryStore((s) => s.saveTabState);
  const fetchProducts = useInventoryStore((s) => s.fetchProducts);
  const fetchCategories = useInventoryStore((s) => s.fetchCategories);
  const fetchLowStock = useInventoryStore((s) => s.fetchLowStock);
  const createProduct = useInventoryStore((s) => s.createProduct);
  const updateProduct = useInventoryStore((s) => s.updateProduct);
  const deleteProduct = useInventoryStore((s) => s.deleteProduct);
  const createCategory = useInventoryStore((s) => s.createCategory);
  const updateCategory = useInventoryStore((s) => s.updateCategory);
  const deleteCategory = useInventoryStore((s) => s.deleteCategory);
  const adjustStock = useInventoryStore((s) => s.adjustStock);
  const createProductWithPresentations = useInventoryStore((s) => s.createProductWithPresentations);
  const uploadProductImage = useInventoryStore((s) => s.uploadProductImage);
  const setSearchQuery = useInventoryStore((s) => s.setSearchQuery);
  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFetch = useCallback(async (filters?: ProductFilters, silent = false) => {
    if (!tenantId) return;
    const effectiveFilters = buildFilters(useInventoryStore.getState(), filters);
    await Promise.all([
      fetchProducts(tenantId, effectiveFilters, silent),
      fetchCategories(tenantId, silent),
      fetchLowStock(tenantId, silent),
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

  useEffect(() => {
    if (!tenantId) return;
    const sub = EventBus.on(SystemEvents.PRODUCTION_COMPLETED, () => {
      doFetch(undefined, true);
    });
    return () => { EventBus.off(sub); };
  }, [tenantId, doFetch]);

  const search = useCallback((query: string, categoryId?: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setSearchQuery(query);
    saveTabState(activeTab as TabKey, { searchQuery: query, filterCategory: categoryId || '' });

    debounceTimer.current = setTimeout(() => {
      if (!tenantId) return;
      fetchProducts(tenantId, { query: query || undefined, categoryId });
    }, DEBOUNCE_MS);
  }, [tenantId]);

  const refresh = useCallback(() => {
    initialFetchDone.current = false;
    doFetch(undefined, true);
  }, [doFetch]);

  return {
    products,
    categories,
    loading,
    activeTab,
    setActiveTab,
    createProduct,
    updateProduct,
    deleteProduct,
    createCategory,
    updateCategory,
    deleteCategory,
    adjustStock,
    createProductWithPresentations,
    uploadProductImage,
    search,
    refresh,
    tabStates,
    saveTabState,
    userId: session?.userId,
    role: session?.role,
  };
}
