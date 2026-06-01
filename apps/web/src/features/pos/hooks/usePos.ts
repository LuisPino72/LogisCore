import { useEffect, useRef, useCallback } from 'react';
import { usePosStore } from '../stores/posStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { EventBus, SystemEvents } from '@logiscore/core';

export function usePos(tenantId: string | null) {
  const products = usePosStore((s) => s.products);
  const cart = usePosStore((s) => s.cart);
  const cashRegister = usePosStore((s) => s.cashRegister);
  const exchangeRate = usePosStore((s) => s.exchangeRate);
  const parkedCarts = usePosStore((s) => s.parkedCarts);
  const favoriteProductIds = usePosStore((s) => s.favoriteProductIds);
  const salesHistory = usePosStore((s) => s.salesHistory);
  const salesHistoryTotal = usePosStore((s) => s.salesHistoryTotal);
  const salesHistoryLoading = usePosStore((s) => s.salesHistoryLoading);
  const loading = usePosStore((s) => s.loading);
  const error = usePosStore((s) => s.error);
  const searchQuery = usePosStore((s) => s.searchQuery);

  const addToCart = usePosStore((s) => s.addToCart);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const updateCartItemQuantity = usePosStore((s) => s.updateCartItemQuantity);
  const clearCart = usePosStore((s) => s.clearCart);
  const completeSale = usePosStore((s) => s.completeSale);
  const openCashRegister = usePosStore((s) => s.openCashRegister);
  const closeCashRegister = usePosStore((s) => s.closeCashRegister);
  const parkCart = usePosStore((s) => s.parkCart);
  const loadParkedCart = usePosStore((s) => s.loadParkedCart);
  const deleteParkedCart = usePosStore((s) => s.deleteParkedCart);
  const toggleFavorite = usePosStore((s) => s.toggleFavorite);
  const fetchSalesHistory = usePosStore((s) => s.fetchSalesHistory);
  const voidSale = usePosStore((s) => s.voidSale);
  const getTodaySoldProducts = usePosStore((s) => s.getTodaySoldProducts);
  const fetchProducts = usePosStore((s) => s.fetchProducts);
  const fetchCashRegister = usePosStore((s) => s.fetchCashRegister);
  const fetchExchangeRate = usePosStore((s) => s.fetchExchangeRate);
  const fetchParkedCarts = usePosStore((s) => s.fetchParkedCarts);
  const fetchPresentations = usePosStore((s) => s.fetchPresentations);
  const getPresentations = usePosStore((s) => s.getPresentations);
  const presentationsMap = usePosStore((s) => s.presentationsMap);
  const setSearchQuery = usePosStore((s) => s.setSearchQuery);
  const reset = usePosStore((s) => s.reset);

  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doRefresh = useCallback(async () => {
    if (!tenantId) return;
    await Promise.all([
      fetchProducts(tenantId),
      fetchCashRegister(tenantId),
      fetchExchangeRate(tenantId),
      fetchPresentations(tenantId),
    ]);
  }, [tenantId, fetchProducts, fetchCashRegister, fetchExchangeRate, fetchPresentations]);

  useEffect(() => {
    if (!tenantId || initialFetchDone.current) return;
    initialFetchDone.current = true;
    doRefresh();
    fetchParkedCarts(tenantId);
  }, [tenantId, doRefresh, fetchParkedCarts]);

  useEffect(() => {
    const subs: ReturnType<typeof EventBus.on>[] = [];
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (tenantId) {
          fetchProducts(tenantId);
          fetchCashRegister(tenantId);
        }
      }, 300);
    };

    const debouncedRefreshProducts = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (tenantId) fetchProducts(tenantId, true);
      }, 300);
    };

    subs.push(EventBus.on('SALE.COMPLETED', () => {
      if (tenantId) {
        fetchProducts(tenantId);
        fetchCashRegister(tenantId);
        fetchExchangeRate(tenantId);
      }
    }));

    subs.push(EventBus.on('INVENTORY.UPDATED', debouncedRefreshProducts));
    subs.push(EventBus.on('INVENTORY.CREATED', debouncedRefreshProducts));
    subs.push(EventBus.on('INVENTORY.DELETED', debouncedRefreshProducts));
    subs.push(EventBus.on('INVENTORY.ADJUSTMENT', debouncedRefreshProducts));
    subs.push(EventBus.on('PURCHASE.RECEIVED', debouncedRefreshProducts));

    subs.push(EventBus.on('BOX.OPENED', debouncedRefresh));
    subs.push(EventBus.on('BOX.CLOSED', debouncedRefresh));

    subs.push(EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, (payload: unknown) => {
      const { table } = payload as { table?: string };
      if ((table === '*' || table === 'products') && tenantId) {
        fetchProducts(tenantId, true);
      }
      if ((table === '*' || table === 'product_presentations') && tenantId) {
        fetchPresentations(tenantId);
      }
      if ((table === '*' || table === 'cash_registers') && tenantId) {
        fetchCashRegister(tenantId, true);
      }
    }));

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      subs.forEach((s) => EventBus.off(s));
    };
  }, [tenantId, fetchProducts, fetchCashRegister, fetchExchangeRate, fetchPresentations]);

  const searchRef = useRef(0);

  const search = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      const seq = ++searchRef.current;
      searchTimer.current = setTimeout(() => {
        if (tenantId && searchRef.current === seq) fetchProducts(tenantId);
      }, 300);
    },
    [tenantId, setSearchQuery, fetchProducts],
  );

  return {
    products, cart, cashRegister, exchangeRate, parkedCarts,
    favoriteProductIds, salesHistory, salesHistoryTotal, salesHistoryLoading,
    loading, error, searchQuery,
    addToCart, removeFromCart, updateCartItemQuantity, clearCart,
    completeSale, openCashRegister, closeCashRegister,
    parkCart, loadParkedCart, deleteParkedCart,
    toggleFavorite, fetchSalesHistory, voidSale, getTodaySoldProducts,
    fetchPresentations, getPresentations, presentationsMap, reset,
    isOpen: cashRegister?.isOpen ?? false,
    search,
    refresh: doRefresh,
    userId: session?.userId ?? null,
    role: session?.role ?? null,
  };
}
