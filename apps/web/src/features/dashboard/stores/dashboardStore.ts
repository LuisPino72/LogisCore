import { create } from 'zustand';
import type { DashboardState, TopProduct, Product, PendingTask } from '../types';
import { dashboardService } from '../services/dashboardService';

const FETCH_COOLDOWN_MS = 2000;

export interface DashboardStore extends DashboardState {
  topProducts: TopProduct[];
  topProductsLoading: boolean;
  lowStockProducts: Product[];
  lowStockLoading: boolean;
  todayEarnings: number | null;
  todayEarningsLoading: boolean;
  pendingTasks: PendingTask[];
  pendingTasksLoading: boolean;
  fetchDashboard: (tenantId: string, silent?: boolean) => Promise<void>;
  fetchTopProducts: (tenantId: string, silent?: boolean) => Promise<void>;
  fetchLowStock: (tenantId: string, silent?: boolean) => Promise<void>;
  fetchPendingTasks: (tenantId: string, silent?: boolean) => Promise<void>;
  reset: () => void;
}

const initialState: DashboardState = {
  tenantInfo: null,
  subscription: null,
  error: null,
};

let lastFetchAt = 0;
let lastFetchTenant: string | null = null;

export const useDashboardStore = create<DashboardStore>((set) => ({
  ...initialState,
  topProducts: [],
  topProductsLoading: false,
  lowStockProducts: [],
  lowStockLoading: false,
  todayEarnings: null,
  todayEarningsLoading: false,
  pendingTasks: [],
  pendingTasksLoading: false,

  fetchDashboard: async (tenantId: string, silent?: boolean) => {
    const now = Date.now();
    if (lastFetchTenant === tenantId && now - lastFetchAt < FETCH_COOLDOWN_MS) {
      return;
    }

    lastFetchAt = now;
    lastFetchTenant = tenantId;

    if (!silent) set({ error: null, todayEarningsLoading: true });

    const [tenantResult, subResult, empResult, earningsResult] = await Promise.all([
      dashboardService.getTenantInfo(tenantId),
      dashboardService.getSubscriptionInfo(tenantId),
      dashboardService.getEmployeeCount(tenantId),
      dashboardService.getTodayEarnings(tenantId),
    ]);

    set({
      tenantInfo: tenantResult.ok ? tenantResult.data : null,
      subscription: subResult.ok ? subResult.data : null,
      todayEarnings: earningsResult.ok ? earningsResult.data : null,
      ...(silent ? {} : { todayEarningsLoading: false }),
      error: !navigator.onLine ? null
        : [!tenantResult.ok && 'Información del negocio',
           !subResult.ok && 'Suscripción',
           !empResult.ok && 'Empleados',
           !earningsResult.ok && 'Ganancias del día',
          ].filter(Boolean).join(', ') || null,
    });
  },

  fetchTopProducts: async (tenantId: string, silent?: boolean) => {
    if (!silent) set({ topProductsLoading: true });
    const result = await dashboardService.getTopProducts(tenantId);
    set({
      topProducts: result.ok ? result.data : [],
      ...(silent ? {} : { topProductsLoading: false }),
    });
  },

  fetchLowStock: async (tenantId: string, silent?: boolean) => {
    if (!silent) set({ lowStockLoading: true });
    const result = await dashboardService.getLowStockProducts(tenantId);
    set({
      lowStockProducts: result.ok ? result.data : [],
      ...(silent ? {} : { lowStockLoading: false }),
    });
  },

  fetchPendingTasks: async (tenantId: string, silent?: boolean) => {
    if (!silent) set({ pendingTasksLoading: true });
    const result = await dashboardService.getPendingTasks(tenantId);
    set({
      pendingTasks: result.ok ? result.data : [],
      ...(silent ? {} : { pendingTasksLoading: false }),
    });
  },

  reset: () => {
    lastFetchAt = 0;
    lastFetchTenant = null;
    set({ ...initialState, topProducts: [], topProductsLoading: false, lowStockProducts: [], lowStockLoading: false, todayEarnings: null, todayEarningsLoading: false, pendingTasks: [], pendingTasksLoading: false });
  },
}));
