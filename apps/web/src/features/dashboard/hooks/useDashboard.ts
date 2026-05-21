import { useEffect, useRef } from 'react';
import { EventBus } from '@logiscore/core';
import { useDashboardStore } from '../stores/dashboardStore';

export function useDashboard(tenantId: string | null) {
  const store = useDashboardStore();
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (tenantId) {
      store.fetchDashboard(tenantId);
    }
    return () => {
      mountedRef.current = false;
      store.reset();
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const handler = () => {
      if (mountedRef.current) {
        store.fetchDashboard(tenantId);
      }
    };
    const sub1 = EventBus.on('SALE.COMPLETED', handler);
    const sub2 = EventBus.on('SYNC.REFRESH_TABLE', handler);
    return () => {
      EventBus.off(sub1);
      EventBus.off(sub2);
    };
  }, [tenantId]);

  return store;
}
