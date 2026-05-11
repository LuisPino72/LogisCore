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
  loading: false,
  error: null,
};

export const useDashboardStore = create<DashboardStore>((set) => ({
  ...initialState,

  fetchDashboard: async (tenantId: string) => {
    set({ loading: true, error: null });

    const [tenantResult, subResult, empResult] = await Promise.all([
      dashboardService.getTenantInfo(tenantId),
      dashboardService.getSubscriptionInfo(tenantId),
      dashboardService.getEmployeeCount(tenantId),
    ]);

    const errors: string[] = [];

    if (!tenantResult.ok) errors.push('Información del negocio');
    if (!subResult.ok) errors.push('Suscripción');
    if (!empResult.ok) errors.push('Empleados');

    set({
      tenantInfo: tenantResult.ok ? tenantResult.data : null,
      subscription: subResult.ok ? subResult.data : null,
      employees: empResult.ok ? empResult.data : 0,
      loading: false,
      error: errors.length > 0 ? `Error al cargar: ${errors.join(', ')}` : null,
    });
  },

  reset: () => set(initialState),
}));
