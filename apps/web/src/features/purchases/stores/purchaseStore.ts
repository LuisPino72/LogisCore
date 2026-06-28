import { create } from 'zustand';
import type { Supplier, PurchaseOrderWithItems, CreateSupplierInput, CreatePurchaseOrderInput, ReceivePurchaseOrderInput, PurchaseOrderStatus } from '../../../specs/purchases';
import { purchaseService } from '../services/purchaseService';
import { inventoryService } from '../../inventory/services/inventoryService';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import { showPermissionDenied } from '../../../common/hooks/usePermissionDenied';
import type { Product } from '../../../specs/inventory';
import type { Presentation } from '../../inventory/types';
import type { TabKey, TabState } from '../types';

const PERMISSION_CODES = new Set(['AUTH_SCOPE_DENIED', 'AUTH_PERMISSION_DENIED', 'PERMISSION_DENIED']);

const DEFAULT_TAB_STATE: TabState = { searchQuery: '', statusFilter: 'all', dateFilter: '' };

interface PurchaseStore {
  suppliers: Supplier[];
  orders: PurchaseOrderWithItems[];
  loading: boolean;
  error: string | null;
  activeTab: TabKey;
  tabStates: Record<TabKey, TabState>;
  pendingPayables: number;
  setActiveTab: (tab: TabKey) => void;
  saveTabState: (tab: TabKey, state: Partial<TabState>) => void;
  fetchSuppliers: (tenantId: string, silent?: boolean) => Promise<void>;
  fetchOrders: (tenantId: string, status?: PurchaseOrderStatus, silent?: boolean) => Promise<void>;
  resolvePreSelectedProducts: (tenantId: string, productIds: string[]) => Promise<Product[]>;
  fetchProductsForOrder: (tenantId: string) => Promise<{ ok: true; data: Product[] } | { ok: false; error: { message: string } }>;
  fetchPresentationsForProduct: (productId: string) => Promise<{ ok: true; data: Presentation[] } | { ok: false; error: { message: string } }>;
  createSupplier: (tenantId: string, userId: string, input: CreateSupplierInput) => Promise<string | null>;
  updateSupplier: (id: string, input: Partial<CreateSupplierInput>, tenantId: string) => Promise<boolean>;
  deleteSupplier: (id: string, tenantId: string) => Promise<boolean>;
  createOrder: (tenantId: string, userId: string, input: CreatePurchaseOrderInput) => Promise<boolean>;
  updateOrder: (id: string, tenantId: string, userId: string, input: CreatePurchaseOrderInput) => Promise<boolean>;
  softDeleteOrder: (id: string, tenantId: string) => Promise<boolean>;
  confirmOrder: (id: string, tenantId: string) => Promise<boolean>;
  receiveOrder: (id: string, input: ReceivePurchaseOrderInput, tenantId: string, userId: string) => Promise<boolean>;
  cancelOrder: (id: string, tenantId: string) => Promise<boolean>;
  paySupplier: (supplierId: string, purchaseOrderId: string, amountUsd: number, paymentMethod: string, tenantId: string, exchangeRate: number, reference?: string, notes?: string) => Promise<{ paymentId: string; newBalance: number; newOrderPaidAmount: number } | null>;
  fetchPendingPayables: (tenantId: string) => Promise<void>;
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
  pendingPayables: 0,
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

  fetchSuppliers: async (tenantId, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const result = await purchaseService.getSuppliers(tenantId);
    if (result.ok) {
      set({ suppliers: result.data, ...(!silent && { loading: false }) });
    } else if (!silent) {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchOrders: async (tenantId, status, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    try {
      const result = await purchaseService.getOrders(tenantId, status);
      if (result.ok) {
        set({ orders: result.data, ...(!silent && { loading: false }) });
      } else if (!silent) {
        set({ loading: false, error: result.error.message });
      }
    } catch (err) {
      if (!silent) {
        set({ loading: false, error: err instanceof Error ? err.message : 'Error al cargar órdenes' });
      }
    }
  },

  resolvePreSelectedProducts: async (tenantId, productIds) => {
    const result = await inventoryService.getProducts(tenantId);
    if (result.ok) {
      return result.data.filter((p) => productIds.includes(p.id));
    }
    return [];
  },

  fetchProductsForOrder: async (tenantId) => {
    return inventoryService.getProducts(tenantId);
  },

  fetchPresentationsForProduct: async (productId) => {
    return inventoryService.getPresentationsForProduct(productId);
  },

  createSupplier: async (tenantId, userId, input) => {
    set({ loading: true, error: null });
    const result = await purchaseService.createSupplier(tenantId, userId, input);
    if (result.ok) {
      await get().fetchSuppliers(tenantId);
      return result.data.id;
    }
    if (PERMISSION_CODES.has(result.error.code)) {
      showPermissionDenied(result.error.message);
    }
    set({ loading: false, error: result.error.message });
    return null;
  },

  updateSupplier: async (id, input, tenantId) => {
    const result = await purchaseService.updateSupplier(id, input, tenantId);
    if (result.ok) {
      await get().fetchSuppliers(tenantId);
      return true;
    }
    if (PERMISSION_CODES.has(result.error.code)) {
      showPermissionDenied(result.error.message);
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
    if (PERMISSION_CODES.has(result.error.code)) {
      showPermissionDenied(result.error.message);
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
    if (PERMISSION_CODES.has(result.error.code)) {
      showPermissionDenied(result.error.message);
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
    if (PERMISSION_CODES.has(result.error.code)) {
      showPermissionDenied(result.error.message);
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
    if (PERMISSION_CODES.has(result.error.code)) {
      showPermissionDenied(result.error.message);
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
    if (PERMISSION_CODES.has(result.error.code)) {
      showPermissionDenied(result.error.message);
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  receiveOrder: async (id, input, tenantId, userId) => {
    set({ loading: true, error: null });
    const rate = useExchangeRateStore.getState().rate ?? 1;
    const result = await purchaseService.receiveOrder(id, input, tenantId, userId, rate);
    if (result.ok) {
      await get().fetchOrders(tenantId);
      return true;
    }
    if (PERMISSION_CODES.has(result.error.code)) {
      showPermissionDenied(result.error.message);
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
    if (PERMISSION_CODES.has(result.error.code)) {
      showPermissionDenied(result.error.message);
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  paySupplier: async (supplierId, purchaseOrderId, amountUsd, paymentMethod, tenantId, exchangeRate, reference, notes) => {
    set({ loading: true, error: null });
    const result = await purchaseService.paySupplierDebt(supplierId, purchaseOrderId, amountUsd, paymentMethod, tenantId, exchangeRate, reference, notes);
    if (result.ok) {
      await Promise.all([
        get().fetchSuppliers(tenantId),
        get().fetchOrders(tenantId),
      ]);
      return result.data;
    }
    if (PERMISSION_CODES.has(result.error.code)) {
      showPermissionDenied(result.error.message);
    }
    set({ loading: false, error: result.error.message });
    return null;
  },

  fetchPendingPayables: async (tenantId) => {
    const total = await purchaseService.getPendingPayables(tenantId);
    set({ pendingPayables: total });
  },

  reset: () => set(initialState),
}));
