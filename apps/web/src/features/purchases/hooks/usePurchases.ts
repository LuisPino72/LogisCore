import { useEffect, useRef, useCallback } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { usePurchaseStore } from '../stores/purchaseStore';
import { useDebouncedCallback } from '../../../common/hooks/useDebouncedCallback';
import type { PurchaseOrderStatus } from '../../../specs/purchases';

export function usePurchases(tenantId: string | null) {
  const suppliers = usePurchaseStore((s) => s.suppliers);
  const orders = usePurchaseStore((s) => s.orders);
  const loading = usePurchaseStore((s) => s.loading);
  const error = usePurchaseStore((s) => s.error);
  const activeTab = usePurchaseStore((s) => s.activeTab);
  const tabStates = usePurchaseStore((s) => s.tabStates);
  const setActiveTab = usePurchaseStore((s) => s.setActiveTab);
  const saveTabState = usePurchaseStore((s) => s.saveTabState);
  const fetchSuppliers = usePurchaseStore((s) => s.fetchSuppliers);
  const fetchOrders = usePurchaseStore((s) => s.fetchOrders);
  const createSupplier = usePurchaseStore((s) => s.createSupplier);
  const updateSupplier = usePurchaseStore((s) => s.updateSupplier);
  const deleteSupplier = usePurchaseStore((s) => s.deleteSupplier);
  const createOrder = usePurchaseStore((s) => s.createOrder);
  const updateOrder = usePurchaseStore((s) => s.updateOrder);
  const softDeleteOrder = usePurchaseStore((s) => s.softDeleteOrder);
  const confirmOrder = usePurchaseStore((s) => s.confirmOrder);
  const receiveOrder = usePurchaseStore((s) => s.receiveOrder);
  const cancelOrder = usePurchaseStore((s) => s.cancelOrder);
  const paySupplier = usePurchaseStore((s) => s.paySupplier);
  const pendingPayables = usePurchaseStore((s) => s.pendingPayables);
  const fetchPendingPayables = usePurchaseStore((s) => s.fetchPendingPayables);
  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);

  const doFetch = useCallback(async (status?: PurchaseOrderStatus, silent = false) => {
    if (!tenantId) return;
    await Promise.all([
      fetchSuppliers(tenantId, silent),
      fetchOrders(tenantId, status, silent),
    ]);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || initialFetchDone.current) return;
    initialFetchDone.current = true;
    doFetch();
  }, [tenantId, doFetch]);

  const refreshAll = useDebouncedCallback(() => {
    if (!tenantId) return;
    fetchSuppliers(tenantId, true);
    fetchOrders(tenantId, undefined, true);
  }, 300, 1000);

  const refreshSuppliers = useDebouncedCallback(() => {
    if (!tenantId) return;
    fetchSuppliers(tenantId, true);
  }, 300, 1000);

  const refreshPayables = useDebouncedCallback(() => {
    if (!tenantId) return;
    fetchPendingPayables(tenantId);
  }, 300, 1000);

  useEffect(() => {
    if (!tenantId) return;

    const subscriptions = [
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, (payload: unknown) => {
        const { table } = payload as { table?: string };
        if (!table || ['purchase_orders', 'purchase_order_items', 'suppliers', 'products', 'inventory_lots'].includes(table)) {
          refreshAll();
        }
      }),
      EventBus.on(SystemEvents.INVENTORY_UPDATED, refreshAll),
      EventBus.on(SystemEvents.INVENTORY_CREATED, refreshAll),
      EventBus.on(SystemEvents.INVENTORY_DELETED, refreshAll),
      EventBus.on(SystemEvents.INVENTORY_ADJUSTMENT, refreshAll),
      EventBus.on(SystemEvents.INVENTORY_PRODUCT_CREATED, refreshAll),
      EventBus.on(SystemEvents.PURCHASE_CREATED, refreshAll),
      EventBus.on(SystemEvents.PURCHASE_UPDATED, refreshAll),
      EventBus.on(SystemEvents.PURCHASE_DELETED, refreshAll),
      EventBus.on(SystemEvents.PURCHASE_CONFIRMED, refreshAll),
      EventBus.on(SystemEvents.PURCHASE_RECEIVED, refreshAll),
      EventBus.on(SystemEvents.PURCHASE_CANCELLED, refreshAll),
      EventBus.on(SystemEvents.PRODUCTION_COMPLETED, refreshAll),
      EventBus.on(SystemEvents.PURCHASE_SUPPLIER_CREATED, refreshSuppliers),
      EventBus.on(SystemEvents.PURCHASE_SUPPLIER_UPDATED, refreshSuppliers),
      EventBus.on(SystemEvents.PURCHASE_SUPPLIER_DELETED, refreshSuppliers),
      EventBus.on(SystemEvents.SUPPLIER_PAYMENT_CREATED, () => {
        refreshSuppliers();
        refreshPayables();
      }),
    ];

    return () => {
      subscriptions.forEach((sub) => EventBus.off(sub));
    };
  }, [tenantId, refreshAll, refreshSuppliers, refreshPayables]);

  const refresh = useCallback(() => {
    initialFetchDone.current = false;
    doFetch();
  }, [doFetch]);

  return {
    suppliers,
    orders,
    loading,
    error,
    activeTab,
    tabStates,
    setActiveTab,
    saveTabState,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    createOrder,
    updateOrder,
    softDeleteOrder,
    confirmOrder,
    receiveOrder,
    cancelOrder,
    paySupplier,
    pendingPayables,
    fetchPendingPayables,
    refresh,
    userId: session?.userId,
    role: session?.role,
  };
}
