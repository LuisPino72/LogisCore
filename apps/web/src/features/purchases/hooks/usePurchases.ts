import { useEffect, useRef, useCallback } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
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

  useEffect(() => {
    if (!tenantId) return;

    const fetchAll = () => doFetch(undefined, true);
    const fetchSuppliersFn = () => fetchSuppliers(tenantId, true);
    const fetchPayables = () => fetchPendingPayables(tenantId);

    const subscriptions = [
      EventBus.on('SYNC.REFRESH_TABLE', (payload: unknown) => {
        const { table } = payload as { table?: string };
        if (!table || ['purchase_orders', 'purchase_order_items', 'suppliers', 'products', 'inventory_lots'].includes(table)) {
          fetchAll();
        }
      }),
      EventBus.on('INVENTORY.UPDATED', fetchAll),
      EventBus.on('INVENTORY.CREATED', fetchAll),
      EventBus.on('INVENTORY.DELETED', fetchAll),
      EventBus.on('INVENTORY.ADJUSTMENT', fetchAll),
      EventBus.on('INVENTORY.PRODUCT_CREATED', fetchAll),
      EventBus.on('PURCHASE.RECEIVED', fetchAll),
      EventBus.on(SystemEvents.PRODUCTION_COMPLETED, fetchAll),
      EventBus.on('PURCHASE.SUPPLIER_CREATED', fetchSuppliersFn),
      EventBus.on('PURCHASE.SUPPLIER_UPDATED', fetchSuppliersFn),
      EventBus.on('PURCHASE.SUPPLIER_DELETED', fetchSuppliersFn),
      EventBus.on('SUPPLIER.PAYMENT_CREATED', () => {
        Promise.all([fetchSuppliersFn(), fetchPayables()]);
      }),
    ];

    return () => {
      subscriptions.forEach((sub) => EventBus.off(sub));
    };
  }, [tenantId, doFetch, fetchSuppliers, fetchPendingPayables]);

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
