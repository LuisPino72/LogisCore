import { useEffect, useRef } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useDashboardStore } from '../stores/dashboardStore';

export function useDashboard(tenantId: string | null) {
  const tenantInfo = useDashboardStore((s) => s.tenantInfo);
  const subscription = useDashboardStore((s) => s.subscription);
  const error = useDashboardStore((s) => s.error);
  const topProducts = useDashboardStore((s) => s.topProducts);
  const topProductsLoading = useDashboardStore((s) => s.topProductsLoading);
  const lowStockProducts = useDashboardStore((s) => s.lowStockProducts);
  const lowStockLoading = useDashboardStore((s) => s.lowStockLoading);
  const todayEarnings = useDashboardStore((s) => s.todayEarnings);
  const todayEarningsLoading = useDashboardStore((s) => s.todayEarningsLoading);
  const pendingTasks = useDashboardStore((s) => s.pendingTasks);
  const pendingTasksLoading = useDashboardStore((s) => s.pendingTasksLoading);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);
  const fetchTopProducts = useDashboardStore((s) => s.fetchTopProducts);
  const fetchLowStock = useDashboardStore((s) => s.fetchLowStock);
  const fetchPendingTasks = useDashboardStore((s) => s.fetchPendingTasks);
  const reset = useDashboardStore((s) => s.reset);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (tenantId) {
      fetchDashboard(tenantId);
      fetchPendingTasks(tenantId);
    }
    return () => {
      mountedRef.current = false;
      reset();
    };
  }, [tenantId, fetchDashboard, fetchPendingTasks, reset]);

  useEffect(() => {
    if (!tenantId) return;
    const handler = () => {
      if (mountedRef.current) {
        fetchDashboard(tenantId);
        fetchTopProducts(tenantId);
        fetchLowStock(tenantId);
        fetchPendingTasks(tenantId);
      }
    };
    const subs = [
      EventBus.on(SystemEvents.SALE_COMPLETED, handler),
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, handler),
      EventBus.on(SystemEvents.INVENTORY_UPDATED, handler),
      EventBus.on(SystemEvents.PURCHASE_RECEIVED, handler),
      EventBus.on(SystemEvents.PRODUCTION_COMPLETED, handler),
      EventBus.on(SystemEvents.SALE_VOIDED, handler),
    ];
    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, fetchDashboard, fetchTopProducts, fetchLowStock, fetchPendingTasks]);

  useEffect(() => {
    if (!tenantId) return;
    const handler = () => {
      if (mountedRef.current) {
        fetchDashboard(tenantId);
        fetchPendingTasks(tenantId);
      }
    };
    const subs = [
      EventBus.on(SystemEvents.EXPENSES_CREATED, handler),
      EventBus.on(SystemEvents.EXPENSES_UPDATED, handler),
      EventBus.on(SystemEvents.EXPENSES_DELETED, handler),
    ];
    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, fetchDashboard, fetchPendingTasks]);

  useEffect(() => {
    if (!tenantId) return;
    const handler = () => {
      if (mountedRef.current) {
        fetchPendingTasks(tenantId);
      }
    };
    const subs = [
      EventBus.on(SystemEvents.CUSTOMER_UPDATED, handler),
    ];
    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, fetchPendingTasks]);

  return {
    tenantInfo,
    subscription,
    error,
    topProducts,
    topProductsLoading,
    lowStockProducts,
    lowStockLoading,
    todayEarnings,
    todayEarningsLoading,
    pendingTasks,
    pendingTasksLoading,
    fetchTopProducts,
    fetchLowStock,
    fetchPendingTasks,
  };
}
