import { create } from 'zustand';
import type { Product, ProductFilters, InventoryState } from '../types';
import { inventoryService } from '../services/inventoryService';
import type { CreateProductInput, AdjustStockInput } from '../types';

interface InventoryStore extends InventoryState {
  setActiveTab: (tab: InventoryState['activeTab']) => void;
  setSearchQuery: (query: string) => void;
  fetchProducts: (tenantId: string, filters?: ProductFilters) => Promise<void>;
  fetchCategories: (tenantId: string) => Promise<void>;
  createProduct: (tenantId: string, userId: string, input: CreateProductInput & { stockInicial?: number }) => Promise<Product | null>;
  updateProduct: (id: string, input: Partial<Product>, tenantId: string) => Promise<boolean>;
  deleteProduct: (id: string, tenantId: string) => Promise<boolean>;
  createCategory: (name: string, tenantId: string) => Promise<boolean>;
  updateCategory: (id: string, name: string, tenantId: string) => Promise<boolean>;
  deleteCategory: (id: string, tenantId: string) => Promise<boolean>;
  adjustStock: (input: AdjustStockInput & { userId: string; tenantId: string }) => Promise<boolean>;
  fetchLowStock: (tenantId: string) => Promise<void>;
  refresh: (tenantId: string, userId: string) => Promise<void>;
  reset: () => void;
}

const initialState: InventoryState = {
  products: [],
  categories: [],
  lowStockProducts: [],
  loading: false,
  error: null,
  searchQuery: '',
  activeTab: 'productos',
};

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  ...initialState,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  fetchProducts: async (tenantId, filters) => {
    set({ loading: true, error: null });
    const result = await inventoryService.getProducts(tenantId, filters);
    if (result.ok) {
      set({ products: result.data, loading: false });
    } else {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchCategories: async (tenantId) => {
    set({ loading: true, error: null });
    const result = await inventoryService.getCategories(tenantId);
    if (result.ok) {
      set({ categories: result.data, loading: false });
    } else {
      set({ loading: false, error: result.error.message });
    }
  },

  createProduct: async (tenantId, userId, input) => {
    set({ loading: true, error: null });
    const result = await inventoryService.createProduct(tenantId, userId, input);
    if (result.ok) {
      set((s) => ({ products: [result.data, ...s.products], loading: false }));
      return result.data;
    }
    set({ loading: false, error: result.error.message });
    return null;
  },

  updateProduct: async (id, input, tenantId) => {
    set({ loading: true, error: null });
    const result = await inventoryService.updateProduct(id, input, tenantId);
    if (result.ok) {
      set({ loading: false });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  deleteProduct: async (id, tenantId) => {
    set({ loading: true, error: null });
    const result = await inventoryService.softDeleteProduct(id, tenantId);
    if (result.ok) {
      const { products } = get();
      set({ products: products.filter((p) => p.id !== id), loading: false });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  createCategory: async (name, tenantId) => {
    set({ loading: true, error: null });
    const result = await inventoryService.createCategory({ name, tenantId });
    if (result.ok) {
      await get().fetchCategories(tenantId);
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  updateCategory: async (id, name, tenantId) => {
    const result = await inventoryService.updateCategory(id, name, tenantId);
    if (result.ok) {
      await get().fetchCategories(tenantId);
      return true;
    }
    return false;
  },

  deleteCategory: async (id, tenantId) => {
    set({ loading: true, error: null });
    const result = await inventoryService.deleteCategory(id, tenantId);
    if (result.ok) {
      set({ categories: get().categories.filter((c) => c.id !== id), loading: false });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  adjustStock: async (input) => {
    set({ loading: true, error: null });
    const result = await inventoryService.adjustStock(input);
    if (result.ok) {
      await get().fetchProducts(input.tenantId);
      await get().fetchLowStock(input.tenantId);
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  fetchLowStock: async (tenantId) => {
    const result = await inventoryService.getLowStockProducts(tenantId);
    if (result.ok) {
      set({ lowStockProducts: result.data });
    }
  },

  refresh: async (tenantId, _userId) => {
    await Promise.all([
      get().fetchProducts(tenantId),
      get().fetchCategories(tenantId),
      get().fetchLowStock(tenantId),
    ]);
  },

  reset: () => set(initialState),
}));
