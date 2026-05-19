import { useEffect } from 'react';
import { EventBus } from '@logiscore/core';
import { useDashboardStore } from '../stores/dashboardStore';

export function useDashboard(tenantId: string | null) {
  const store = useDashboardStore();

  useEffect(() => {
    if (tenantId) {
      store.fetchDashboard(tenantId);
    }
    return () => {
      store.reset();
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const handler = () => store.fetchDashboard(tenantId);
    const sub1 = EventBus.on('SALE.COMPLETED', handler);
    const sub2 = EventBus.on('SYNC.REFRESH_TABLE', handler);
    return () => {
      EventBus.off(sub1);
      EventBus.off(sub2);
    };
  }, [tenantId]);

  return store;
}
