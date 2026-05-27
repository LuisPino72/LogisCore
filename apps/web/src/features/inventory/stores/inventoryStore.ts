import { create } from 'zustand';
import type { Product, ProductFilters, InventoryState, TabKey, TabState, CreatePresentationInput, PresentationWithProduct, UpdatePresentationInput } from '../types';
import { inventoryService } from '../services/inventoryService';
import { imageCacheService } from '../../../services/imageCache/imageCacheService';
import type { CreateProductInput, AdjustStockInput } from '../types';

const DEFAULT_TAB_STATE: TabState = { searchQuery: '', filterCategory: '', stockFilter: 'all', page: 1 };

interface InventoryStore extends InventoryState {
  setActiveTab: (tab: TabKey) => void;
  setSearchQuery: (query: string) => void;
  saveTabState: (tab: TabKey, state: Partial<TabState>) => void;
  fetchProducts: (tenantId: string, filters?: ProductFilters, silent?: boolean) => Promise<void>;
  fetchCategories: (tenantId: string, silent?: boolean) => Promise<void>;
  createProduct: (tenantId: string, userId: string, input: CreateProductInput & { stockInicial?: number }) => Promise<Product | null>;
  updateProduct: (id: string, input: Partial<Product>, tenantId: string) => Promise<boolean>;
  deleteProduct: (id: string, tenantId: string) => Promise<boolean>;
  createCategory: (name: string, tenantId: string) => Promise<string | null>;
  updateCategory: (id: string, name: string, tenantId: string) => Promise<boolean>;
  deleteCategory: (id: string, tenantId: string) => Promise<boolean>;
  adjustStock: (input: AdjustStockInput & { userId: string; tenantId: string }) => Promise<boolean>;
  fetchLowStock: (tenantId: string, silent?: boolean) => Promise<void>;
  createProductWithPresentations: (
    tenantId: string,
    userId: string,
    input: CreateProductInput & { stockInicial?: number },
    presentations: CreatePresentationInput[],
    stockType: 'shared' | 'independent',
  ) => Promise<Product | null>;
  fetchPresentations: (productId: string) => Promise<PresentationWithProduct[]>;
  fetchAllPresentations: (tenantId: string) => Promise<void>;
  updatePresentation: (tenantId: string, presentationId: string, input: UpdatePresentationInput) => Promise<boolean>;
  deletePresentation: (tenantId: string, presentationId: string) => Promise<boolean>;
  refresh: (tenantId: string, userId: string) => Promise<void>;
  reset: () => void;
}

const initialState: InventoryState = {
  products: [],
  categories: [],
  lowStockProducts: [],
  presentationsByProduct: {},
  allPresentationChildIds: new Set<string>(),
  allPresentationParentIds: new Set<string>(),
  loading: false,
  error: null,
  searchQuery: '',
  activeTab: 'productos',
  tabStates: {
    productos: { ...DEFAULT_TAB_STATE },
    categorias: { ...DEFAULT_TAB_STATE },
    historial: { ...DEFAULT_TAB_STATE },
  },
};

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  ...initialState,

  setActiveTab: (tab) => {
    const { tabStates } = get();
    set({
      activeTab: tab,
      searchQuery: tabStates[tab].searchQuery,
    });
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  saveTabState: (tab, state) => {
    set({
      tabStates: {
        ...get().tabStates,
        [tab]: { ...get().tabStates[tab], ...state },
      },
    });
  },

  fetchProducts: async (tenantId, filters, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const result = await inventoryService.getProducts(tenantId, filters);
    if (result.ok) {
      set({ products: result.data, loading: false });
      imageCacheService.preloadAll(result.data);
    } else {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchCategories: async (tenantId, silent = false) => {
    if (!silent) set({ loading: true, error: null });
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
    set({ error: null });
    const result = await inventoryService.updateProduct(id, input, tenantId);
    if (result.ok) {
      set((s) => ({
        products: s.products.map((p) => p.id === id ? { ...p, ...result.data } : p),
      }));
      return true;
    }
    set({ error: result.error.message });
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
      return result.data.id;
    }
    set({ loading: false, error: result.error.message });
    return null;
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
    set({ error: null });
    const result = await inventoryService.adjustStock(input);
    if (result.ok) {
      set((s) => ({
        products: s.products.map((p) =>
          p.id === input.productId
            ? { ...p, stock: p.stock + input.quantity }
            : p
        ),
      }));
      await get().fetchLowStock(input.tenantId, true);
      return true;
    }
    set({ error: result.error.message });
    return false;
  },

  fetchLowStock: async (tenantId, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const result = await inventoryService.getLowStockProducts(tenantId);
    if (result.ok) {
      set({ lowStockProducts: result.data, loading: false });
    } else {
      set({ loading: false, error: result.error.message });
    }
  },

  createProductWithPresentations: async (tenantId, userId, input, presentations, stockType) => {
    set({ loading: true, error: null });
    const result = await inventoryService.createProductWithPresentations(tenantId, userId, input, presentations, stockType);
    if (result.ok) {
      set((s) => ({
        products: [result.data.product, ...s.products],
        presentationsByProduct: {
          ...s.presentationsByProduct,
          [result.data.product.id]: result.data.presentations.map((p) => ({
            ...p,
            product: result.data.product,
          })),
        },
        loading: false,
      }));
      return result.data.product;
    }
    set({ loading: false, error: result.error.message });
    return null;
  },

  fetchPresentations: async (productId) => {
    const result = await inventoryService.getPresentationsForProduct(productId);
    if (result.ok) {
      set((s) => ({
        presentationsByProduct: { ...s.presentationsByProduct, [productId]: result.data },
      }));
      return result.data;
    }
    set({ error: result.error.message });
    return [];
  },

  fetchAllPresentations: async (tenantId) => {
    const allPres = await inventoryService.getAllPresentations(tenantId);
    if (allPres.ok) {
      const childIds = new Set<string>();
      const parentIds = new Set<string>();
      for (const p of allPres.data) {
        if (p.childProductId) childIds.add(p.childProductId);
        parentIds.add(p.productId);
      }
      set({
        allPresentationChildIds: childIds,
        allPresentationParentIds: parentIds,
      });
    }
  },

  updatePresentation: async (tenantId, presentationId, input) => {
    set({ loading: true, error: null });
    const result = await inventoryService.updatePresentation(tenantId, presentationId, input);
    if (result.ok) {
      set({ loading: false });
      const { presentationsByProduct } = get();
      for (const [pid, presList] of Object.entries(presentationsByProduct)) {
        const idx = presList.findIndex((p) => p.id != null && p.id === presentationId);
        if (idx !== -1) {
          const updated = { ...presList[idx], ...result.data };
          const newList = [...presList];
          newList[idx] = updated;
          set({ presentationsByProduct: { ...presentationsByProduct, [pid]: newList } });
          break;
        }
      }
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  deletePresentation: async (tenantId, presentationId) => {
    set({ loading: true, error: null });
    const result = await inventoryService.deletePresentation(tenantId, presentationId);
    if (result.ok) {
      set((s) => {
        const updated: Record<string, PresentationWithProduct[]> = {};
        for (const [pid, presList] of Object.entries(s.presentationsByProduct)) {
          updated[pid] = presList.filter((p) => p.id != null && p.id !== presentationId);
        }
        return { presentationsByProduct: updated, loading: false };
      });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
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
