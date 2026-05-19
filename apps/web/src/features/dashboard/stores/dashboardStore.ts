import { create } from 'zustand';
import type { DashboardState } from '../types';
import { dashboardService } from '../services/dashboardService';

export interface DashboardStore extends DashboardState {
  fetchDashboard: (tenantId: string) => Promise<void>;
  reset: () => void;
}

const initialState: DashboardState = {
  tenantInfo: null,
  employees: 0,
  subscription: null,
  todayEarnings: 0,
  loading: false,
  error: null,
};

export const useDashboardStore = create<DashboardStore>((set) => ({
  ...initialState,

  fetchDashboard: async (tenantId: string) => {
    set({ loading: true, error: null });

    const [tenantResult, subResult, empResult, earningsResult] = await Promise.all([
      dashboardService.getTenantInfo(tenantId),
      dashboardService.getSubscriptionInfo(tenantId),
      dashboardService.getEmployeeCount(tenantId),
      dashboardService.getTodayEarnings(tenantId),
    ]);

    set({
      tenantInfo: tenantResult.ok ? tenantResult.data : null,
      subscription: subResult.ok ? subResult.data : null,
      employees: empResult.ok ? empResult.data : 0,
      todayEarnings: earningsResult.ok ? earningsResult.data : 0,
      loading: false,
      error: !navigator.onLine ? null
        : [!tenantResult.ok && 'Información del negocio',
           !subResult.ok && 'Suscripción',
           !empResult.ok && 'Empleados',
           !earningsResult.ok && 'Ganancias del día',
          ].filter(Boolean).join(', ') || null,
    });
  },

  reset: () => set(initialState),
}));
