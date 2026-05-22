import { create } from 'zustand';
import type { Supplier, PurchaseOrderWithItems, CreateSupplierInput, CreatePurchaseOrderInput, ReceivePurchaseOrderInput, PurchaseOrderStatus } from '../../../specs/purchases';
import { purchaseService } from '../services/purchaseService';
import type { TabKey, TabState } from '../types';

const DEFAULT_TAB_STATE: TabState = { searchQuery: '', statusFilter: 'all', dateFilter: '' };

interface PurchaseStore {
  suppliers: Supplier[];
  orders: PurchaseOrderWithItems[];
  loading: boolean;
  error: string | null;
  activeTab: TabKey;
  tabStates: Record<TabKey, TabState>;
  setActiveTab: (tab: TabKey) => void;
  saveTabState: (tab: TabKey, state: Partial<TabState>) => void;
  fetchSuppliers: (tenantId: string) => Promise<void>;
  fetchOrders: (tenantId: string, status?: PurchaseOrderStatus) => Promise<void>;
  createSupplier: (tenantId: string, userId: string, input: CreateSupplierInput) => Promise<boolean>;
  updateSupplier: (id: string, input: Partial<CreateSupplierInput>, tenantId: string) => Promise<boolean>;
  deleteSupplier: (id: string, tenantId: string) => Promise<boolean>;
  createOrder: (tenantId: string, userId: string, input: CreatePurchaseOrderInput) => Promise<boolean>;
  updateOrder: (id: string, tenantId: string, userId: string, input: CreatePurchaseOrderInput) => Promise<boolean>;
  softDeleteOrder: (id: string, tenantId: string) => Promise<boolean>;
  confirmOrder: (id: string, tenantId: string) => Promise<boolean>;
  receiveOrder: (id: string, input: ReceivePurchaseOrderInput, tenantId: string, userId: string) => Promise<boolean>;
  cancelOrder: (id: string, tenantId: string) => Promise<boolean>;
  reset: () => void;
}

const initialState = {
  suppliers: [],
  orders: [],
  loading: false,
  error: null,
  activeTab: 'ordenes' as TabKey,
  tabStates: {
    ordenes: { ...DEFAULT_TAB_STATE },
    proveedores: { ...DEFAULT_TAB_STATE },
  },
};

export const usePurchaseStore = create<PurchaseStore>((set, get) => ({
  ...initialState,

  setActiveTab: (tab) => set({ activeTab: tab }),
  saveTabState: (tab, state) => {
    set({
      tabStates: {
        ...get().tabStates,
        [tab]: { ...get().tabStates[tab], ...state },
      },
    });
  },

  fetchSuppliers: async (tenantId) => {
    set({ loading: true, error: null });
    const result = await purchaseService.getSuppliers(tenantId);
    if (result.ok) {
      set({ suppliers: result.data, loading: false });
    } else {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchOrders: async (tenantId, status) => {
    set({ loading: true, error: null });
    try {
      const result = await purchaseService.getOrders(tenantId, status);
      if (result.ok) {
        set({ orders: result.data, loading: false });
      } else {
        set({ loading: false, error: result.error.message });
      }
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Error al cargar órdenes' });
    }
  },

  createSupplier: async (tenantId, userId, input) => {
    set({ loading: true, error: null });
    const result = await purchaseService.createSupplier(tenantId, userId, input);
    if (result.ok) {
      await get().fetchSuppliers(tenantId);
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  updateSupplier: async (id, input, tenantId) => {
    const result = await purchaseService.updateSupplier(id, input, tenantId);
    if (result.ok) {
      await get().fetchSuppliers(tenantId);
      return true;
    }
    return false;
  },

  deleteSupplier: async (id, tenantId) => {
    set({ loading: true, error: null });
    const result = await purchaseService.softDeleteSupplier(id, tenantId);
    if (result.ok) {
      set({ suppliers: get().suppliers.filter((s) => s.id !== id), loading: false });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  createOrder: async (tenantId, userId, input) => {
    set({ loading: true, error: null });
    const result = await purchaseService.createOrder(tenantId, userId, input);
    if (result.ok) {
      await get().fetchOrders(tenantId);
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  updateOrder: async (id, tenantId, userId, input) => {
    set({ loading: true, error: null });
    const result = await purchaseService.updateOrder(id, tenantId, userId, input);
    if (result.ok) {
      await get().fetchOrders(tenantId);
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  softDeleteOrder: async (id, tenantId) => {
    set({ loading: true, error: null });
    const result = await purchaseService.softDeleteOrder(id, tenantId);
    if (result.ok) {
      set({ orders: get().orders.filter((o) => o.id !== id), loading: false });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  confirmOrder: async (id, tenantId) => {
    set({ loading: true, error: null });
    const result = await purchaseService.confirmOrder(id, tenantId);
    if (result.ok) {
      await get().fetchOrders(tenantId);
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  receiveOrder: async (id, input, tenantId, userId) => {
    set({ loading: true, error: null });
    const result = await purchaseService.receiveOrder(id, input, tenantId, userId);
    if (result.ok) {
      await get().fetchOrders(tenantId);
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  cancelOrder: async (id, tenantId) => {
    set({ loading: true, error: null });
    const result = await purchaseService.cancelOrder(id, tenantId);
    if (result.ok) {
      await get().fetchOrders(tenantId);
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  reset: () => set(initialState),
}));
