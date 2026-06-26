import { useEffect, useRef } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useDashboardStore } from '../stores/dashboardStore';
import { useDebouncedCallback } from '../../../common/hooks/useDebouncedCallback';

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

  const refreshDashboard = useDebouncedCallback(() => {
    if (!tenantId || !mountedRef.current) return;
    fetchDashboard(tenantId);
    fetchTopProducts(tenantId);
    fetchLowStock(tenantId);
    fetchPendingTasks(tenantId);
  }, 300, 1000);

  const refreshTasks = useDebouncedCallback(() => {
    if (!tenantId || !mountedRef.current) return;
    fetchDashboard(tenantId);
    fetchPendingTasks(tenantId);
  }, 300, 1000);

  useEffect(() => {
    if (!tenantId) return;
    const subs = [
      EventBus.on(SystemEvents.SALE_COMPLETED, refreshDashboard),
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, refreshDashboard),
      EventBus.on(SystemEvents.INVENTORY_UPDATED, refreshDashboard),
      EventBus.on(SystemEvents.PURCHASE_RECEIVED, refreshDashboard),
      EventBus.on(SystemEvents.PRODUCTION_COMPLETED, refreshDashboard),
      EventBus.on(SystemEvents.SALE_VOIDED, refreshDashboard),
      EventBus.on(SystemEvents.EXPENSES_CREATED, refreshTasks),
      EventBus.on(SystemEvents.EXPENSES_UPDATED, refreshTasks),
      EventBus.on(SystemEvents.EXPENSES_DELETED, refreshTasks),
      EventBus.on(SystemEvents.CUSTOMER_UPDATED, refreshTasks),
    ];
    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, refreshDashboard, refreshTasks]);

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
