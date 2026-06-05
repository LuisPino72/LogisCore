import { create } from 'zustand';
import type { Recipe, ProductionOrder, ProductionState, RecipeFilters, ProductionOrderFilters, IngredientAvailability, RecipeWithLines, CreateRecipeInput, UpdateRecipeInput, CreateProductionOrderInput } from '../types';
import { productionService } from '../services/productionService';

interface ProductionStore extends ProductionState {
  // Recipes
  recipes: Recipe[];
  fetchRecipes: (tenantId: string, filters?: RecipeFilters, silent?: boolean) => Promise<void>;
  createRecipe: (tenantId: string, userId: string, input: CreateRecipeInput) => Promise<Recipe | null>;
  updateRecipe: (id: string, input: UpdateRecipeInput, tenantId: string) => Promise<boolean>;
  deleteRecipe: (id: string, tenantId: string) => Promise<boolean>;
  getRecipeWithLines: (tenantId: string, recipeId: string) => Promise<RecipeWithLines | null>;

  // Production Orders
  productionOrders: ProductionOrder[];
  fetchOrders: (tenantId: string, filters?: ProductionOrderFilters, silent?: boolean) => Promise<void>;
  createOrder: (tenantId: string, userId: string, input: CreateProductionOrderInput) => Promise<ProductionOrder | null>;
  cancelOrder: (orderId: string, tenantId: string) => Promise<boolean>;

  // Assembly
  checkIngredientsAvailability: (recipeId: string, batchCount: number) => Promise<IngredientAvailability[]>;
  calculateRecipeCost: (recipeId: string, batchCount: number) => Promise<{ totalCost: number; warnings: string[] }>;

  // UI State
  activeTab: 'recipes' | 'produce' | 'history';
  setActiveTab: (tab: 'recipes' | 'produce' | 'history') => void;

  // Refresh
  refresh: (tenantId: string) => Promise<void>;
  reset: () => void;
}

const initialState: ProductionState = {
  recipes: [],
  productionOrders: [],
  loading: false,
  error: null,
};

export const useProductionStore = create<ProductionStore>((set, get) => ({
  ...initialState,
  activeTab: 'recipes',

  setActiveTab: (tab) => set({ activeTab: tab }),

  // ===== RECIPES =====

  fetchRecipes: async (tenantId, filters, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const result = await productionService.getRecipes(tenantId, filters);
    if (result.ok) {
      set({ recipes: result.data, loading: false });
    } else {
      set({ loading: false, error: result.error });
    }
  },

  createRecipe: async (tenantId, userId, input) => {
    set({ loading: true, error: null });
    const result = await productionService.createRecipe(tenantId, userId, input);
    if (result.ok) {
      set((s) => ({ recipes: [result.data, ...s.recipes], loading: false }));
      return result.data;
    }
    set({ loading: false, error: result.error });
    return null;
  },

  updateRecipe: async (id, input, tenantId) => {
    set({ error: null });
    const result = await productionService.updateRecipe(id, input, tenantId);
    if (result.ok) {
      set((s) => ({
        recipes: s.recipes.map((r) => r.id === id ? { ...r, ...result.data } : r),
      }));
      return true;
    }
    set({ error: result.error });
    return false;
  },

  deleteRecipe: async (id, tenantId) => {
    set({ loading: true, error: null });
    const result = await productionService.deleteRecipe(id, tenantId);
    if (result.ok) {
      set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id), loading: false }));
      return true;
    }
    set({ loading: false, error: result.error });
    return false;
  },

  getRecipeWithLines: async (tenantId, recipeId) => {
    const result = await productionService.getRecipeWithLines(tenantId, recipeId);
    if (result.ok) return result.data;
    set({ error: result.error });
    return null;
  },

  // ===== PRODUCTION ORDERS =====

  fetchOrders: async (tenantId, filters, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const result = await productionService.getOrders(tenantId, filters);
    if (result.ok) {
      set({ productionOrders: result.data, loading: false });
    } else {
      set({ loading: false, error: result.error });
    }
  },

  createOrder: async (tenantId, userId, input) => {
    set({ loading: true, error: null });
    const result = await productionService.createOrder(tenantId, userId, input);
    if (result.ok) {
      set((s) => ({ productionOrders: [result.data, ...s.productionOrders], loading: false }));
      return result.data;
    }
    set({ loading: false, error: result.error });
    return null;
  },

  cancelOrder: async (orderId, tenantId) => {
    set({ error: null });
    const result = await productionService.cancelOrder(orderId, tenantId);
    if (result.ok) {
      set((s) => ({
        productionOrders: s.productionOrders.map((o) =>
          o.id === orderId ? { ...o, status: 'cancelled' as const } : o
        ),
      }));
      return true;
    }
    set({ error: result.error });
    return false;
  },

  // ===== ASSEMBLY =====

  checkIngredientsAvailability: async (recipeId, batchCount) => {
    const result = await productionService.checkIngredientsAvailability(recipeId, batchCount);
    if (result.ok) return result.data;
    set({ error: result.error });
    return [];
  },

  calculateRecipeCost: async (recipeId, batchCount) => {
    const result = await productionService.calculateRecipeCost(recipeId, batchCount);
    if (result.ok) return result.data;
    return { totalCost: 0, warnings: [] };
  },

  // ===== REFRESH =====

  refresh: async (tenantId) => {
    const { fetchRecipes, fetchOrders } = get();
    await Promise.all([
      fetchRecipes(tenantId, undefined, true),
      fetchOrders(tenantId, undefined, true),
    ]);
  },

  reset: () => set(initialState),
}));
