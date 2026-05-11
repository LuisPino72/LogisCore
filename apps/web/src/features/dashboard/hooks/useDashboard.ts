import { useEffect } from 'react';
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

  return store;
}
