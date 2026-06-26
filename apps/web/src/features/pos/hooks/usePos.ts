import { useEffect, useRef, useCallback } from 'react';
import { usePosStore } from '../stores/posStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import { EventBus, SystemEvents } from '@logiscore/core';
import { settingsService } from '../../settings/services/settingsService';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { useDebouncedCallback } from '../../../common/hooks/useDebouncedCallback';
import type { Customer } from '../../../specs/customers';

export function usePos(tenantId: string | null) {
  const products = usePosStore((s) => s.products);
  const cart = usePosStore((s) => s.cart);
  const cashRegister = usePosStore((s) => s.cashRegister);
  const exchangeRate = useExchangeRateStore((s) => s.rate);
  const parkedCarts = usePosStore((s) => s.parkedCarts);
  const favoriteProductIds = usePosStore((s) => s.favoriteProductIds);
  const salesHistory = usePosStore((s) => s.salesHistory);
  const salesHistoryTotal = usePosStore((s) => s.salesHistoryTotal);
  const salesHistoryLoading = usePosStore((s) => s.salesHistoryLoading);
  const loading = usePosStore((s) => s.loading);
  const error = usePosStore((s) => s.error);
  const searchQuery = usePosStore((s) => s.searchQuery);
  const activeSessionId = usePosStore((s) => s.activeSessionId);
  const activeRegisterId = usePosStore((s) => s.activeRegisterId);
  const registerName = usePosStore((s) => s.registerName);

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
  const fetchParkedCarts = usePosStore((s) => s.fetchParkedCarts);
  const fetchPresentations = usePosStore((s) => s.fetchPresentations);
  const fetchLatestRate = useExchangeRateStore((s) => s.fetchLatest);
  const getPresentations = usePosStore((s) => s.getPresentations);
  const presentacionesMap = usePosStore((s) => s.presentationsMap);
  const setSearchQuery = usePosStore((s) => s.setSearchQuery);
  const selectedCustomerId = usePosStore((s) => s.selectedCustomerId);
  const selectedCustomer = usePosStore((s) => s.selectedCustomer);
  const setSelectedCustomer = usePosStore((s) => s.setSelectedCustomer);
  const isCreditSale = usePosStore((s) => s.isCreditSale);
  const setIsCreditSale = usePosStore((s) => s.setIsCreditSale);
  const reset = usePosStore((s) => s.reset);

  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doRefresh = useCallback(async () => {
    if (!tenantId) return;
    await Promise.all([
      fetchProducts(tenantId),
      fetchCashRegister(tenantId),
      fetchLatestRate(tenantId),
      fetchPresentations(tenantId),
    ]);
  }, [tenantId, fetchProducts, fetchCashRegister, fetchLatestRate, fetchPresentations]);

  useEffect(() => {
    if (!tenantId || initialFetchDone.current) return;
    initialFetchDone.current = true;
    doRefresh();
    fetchParkedCarts(tenantId);
    if (!useSettingsStore.getState().loaded) {
      settingsService.loadTenantSettings(tenantId);
    }
  }, [tenantId, doRefresh, fetchParkedCarts]);

  const refreshProducts = useDebouncedCallback(() => {
    if (!tenantId) return;
    fetchProducts(tenantId, true);
  }, 300, 1000);

  const refreshFull = useDebouncedCallback(() => {
    if (!tenantId) return;
    fetchProducts(tenantId, true);
    fetchCashRegister(tenantId, true);
    fetchLatestRate(tenantId);
    fetchPresentations(tenantId);
  }, 300, 1000);

  useEffect(() => {
    if (!tenantId) return;

    const refreshCashRegister = () => {
      fetchProducts(tenantId, true);
      fetchCashRegister(tenantId, true);
    };

    const subs = [
      EventBus.on(SystemEvents.SALE_COMPLETED, refreshFull),
      EventBus.on(SystemEvents.INVENTORY_UPDATED, refreshProducts),
      EventBus.on(SystemEvents.INVENTORY_CREATED, refreshProducts),
      EventBus.on(SystemEvents.INVENTORY_DELETED, refreshProducts),
      EventBus.on(SystemEvents.INVENTORY_PRODUCT_CREATED, refreshProducts),
      EventBus.on(SystemEvents.INVENTORY_ADJUSTMENT, refreshProducts),
      EventBus.on(SystemEvents.PURCHASE_RECEIVED, refreshProducts),
      EventBus.on(SystemEvents.PRODUCTION_RECIPE_CREATED, refreshProducts),
      EventBus.on(SystemEvents.BOX_OPENED, refreshCashRegister),
      EventBus.on(SystemEvents.BOX_CLOSED, refreshCashRegister),
      EventBus.on(SystemEvents.PRODUCTION_COMPLETED, refreshProducts),
      EventBus.on(SystemEvents.PRODUCTION_ASSEMBLY_CONSUMED, refreshProducts),
      EventBus.on(SystemEvents.CUSTOMER_UPDATED, refreshProducts),
      EventBus.on(SystemEvents.EXCHANGE_RATE_UPDATED, () => {
        if (tenantId) fetchLatestRate(tenantId);
      }),
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, (payload: unknown) => {
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
      }),
    ];

    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, fetchProducts, fetchCashRegister, fetchLatestRate, fetchPresentations, refreshProducts, refreshFull]);

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
    selectedCustomerId, selectedCustomer, setSelectedCustomer: (c: Customer | null) => setSelectedCustomer(c),
    isCreditSale, setIsCreditSale,
    addToCart, removeFromCart, updateCartItemQuantity, clearCart,
    completeSale, openCashRegister, closeCashRegister,
    parkCart, loadParkedCart, deleteParkedCart,
    toggleFavorite, fetchSalesHistory, voidSale, getTodaySoldProducts,
    fetchPresentations, getPresentations, presentacionesMap, reset,
    isOpen: cashRegister?.isOpen ?? false,
    activeSessionId,
    activeRegisterId,
    registerName,
    search,
    refresh: doRefresh,
    userId: session?.userId ?? null,
    role: session?.role ?? null,
  };
}
