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
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);
  const fetchTopProducts = useDashboardStore((s) => s.fetchTopProducts);
  const fetchLowStock = useDashboardStore((s) => s.fetchLowStock);
  const reset = useDashboardStore((s) => s.reset);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (tenantId) {
      fetchDashboard(tenantId);
    }
    return () => {
      mountedRef.current = false;
      reset();
    };
  }, [tenantId, fetchDashboard, reset]);

  useEffect(() => {
    if (!tenantId) return;
    const handler = () => {
      if (mountedRef.current) {
        fetchDashboard(tenantId);
        fetchLowStock(tenantId);
      }
    };
    const sub1 = EventBus.on(SystemEvents.SALE_COMPLETED, handler);
    const sub2 = EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, handler);
    return () => {
      EventBus.off(sub1);
      EventBus.off(sub2);
    };
  }, [tenantId, fetchDashboard, fetchLowStock]);

  useEffect(() => {
    if (!tenantId) return;
    const handler = () => {
      if (mountedRef.current) {
        fetchDashboard(tenantId);
      }
    };
    const subs = [
      EventBus.on(SystemEvents.EXPENSES_CREATED, handler),
      EventBus.on(SystemEvents.EXPENSES_UPDATED, handler),
      EventBus.on(SystemEvents.EXPENSES_DELETED, handler),
    ];
    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, fetchDashboard]);

  return {
    tenantInfo,
    subscription,
    error,
    topProducts,
    topProductsLoading,
    lowStockProducts,
    lowStockLoading,
    fetchTopProducts,
    fetchLowStock,
  };
}
