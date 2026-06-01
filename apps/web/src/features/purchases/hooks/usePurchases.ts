import { useEffect, useRef, useCallback } from 'react';
import { EventBus } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { usePurchaseStore } from '../stores/purchaseStore';
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

  useEffect(() => {
    if (!tenantId) return;

    const sub = EventBus.on('SYNC.REFRESH_TABLE', (payload: unknown) => {
      const { table } = payload as { table?: string };
      if (!table || ['purchase_orders', 'purchase_order_items', 'suppliers', 'products', 'inventory_lots'].includes(table)) {
        doFetch(undefined, true);
      }
    });

    return () => {
      EventBus.off(sub);
    };
  }, [tenantId, doFetch]);

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
    refresh,
    userId: session?.userId,
    role: session?.role,
  };
}
