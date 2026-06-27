import { posService } from '../services/posService';
import { inventoryService } from '../../../features/inventory/services/inventoryService';
import { imageCacheService } from '../../../services/imageCache/imageCacheService';
import { getDb } from '../../../services/dexie/db';
import { logger } from '../../../lib/logger';
import type { Product, Category } from '../../../specs/inventory';
import type { Presentation } from '../../../specs/inventory';

export interface PosCatalogSlice {
  products: Product[];
  categories: Category[];
  selectedCategory: string | null;
  presentationsMap: Record<string, Presentation[]>;
  assemblyRecipesMap: Record<string, { recipeId: string; wastePct: number; lines: Array<{ productId: string; quantity: number }> }>;
  favoriteProductIds: Set<string>;
  fetchProducts: (tenantId: string, silent?: boolean) => Promise<void>;
  loadCategories: (tenantId: string) => Promise<void>;
  setSelectedCategory: (categoryId: string | null) => void;
  fetchPresentations: (tenantId: string) => Promise<void>;
  getPresentations: (productId: string) => Presentation[];
  toggleFavorite: (tenantId: string, productId: string) => Promise<void>;
  isFavorite: (productId: string) => boolean;
  restoreFavorites: (tenantId: string) => Promise<void>;
}

export const initialCatalogState = {
  products: [] as Product[],
  categories: [] as Category[],
  selectedCategory: null as string | null,
  presentationsMap: {} as Record<string, Presentation[]>,
  assemblyRecipesMap: {} as Record<string, { recipeId: string; wastePct: number; lines: Array<{ productId: string; quantity: number }> }>,
  favoriteProductIds: new Set<string>(),
};

type CatalogGetter = PosCatalogSlice & {
  loading: boolean;
  error: string | null;
};

export const createCatalogSlice = (set: (setter: Partial<CatalogGetter> | ((state: CatalogGetter) => Partial<CatalogGetter>)) => void, get: () => CatalogGetter): PosCatalogSlice => ({
  ...initialCatalogState,

  fetchProducts: async (tenantId, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const [, result] = await Promise.all([
      get().restoreFavorites(tenantId),
      posService.getProductsForSale(tenantId),
    ]);
    if (result.ok) {
      const favResult = await posService.getFavorites(tenantId);
      const favIds = favResult.ok ? favResult.data : new Set<string>();

      const recipesMap: Record<string, { recipeId: string; wastePct: number; lines: Array<{ productId: string; quantity: number }> }> = {};
      try {
        const db = getDb();
        const allRecipes = await db.recipes.toArray();
        const assemblyRecipes = allRecipes.filter(r => !r.deletedAt && r.isActive && r.mode === 'assembly');
        const recipeLinePromises = assemblyRecipes.map(async (recipe) => {
          const lines = await db.recipeLines
            .where({ recipeId: recipe.id })
            .filter(l => !l.deletedAt)
            .toArray();
          return { recipe, lines };
        });
        const recipeResults = await Promise.all(recipeLinePromises);
        for (const { recipe, lines } of recipeResults) {
          recipesMap[recipe.productId] = {
            recipeId: recipe.id,
            wastePct: recipe.wastePct,
            lines: lines.map(l => ({ productId: l.productId, quantity: l.quantity })),
          };
        }
      } catch (err) {
        logger.warn('posCatalogStore', 'assemblyRecipesMap falló:', err);
      }

      const sorted = [...result.data].sort((a, b) => {
        const aFav = favIds.has(a.id) ? 1 : 0;
        const bFav = favIds.has(b.id) ? 1 : 0;
        return bFav - aFav;
      });
      set({ products: sorted, favoriteProductIds: favIds, assemblyRecipesMap: recipesMap, ...(!silent && { loading: false }) });
      imageCacheService.preloadAll(result.data);
    } else if (!silent) {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchPresentations: async (tenantId) => {
    const result = await inventoryService.getAllPresentations(tenantId);
    if (result.ok) {
      const map: Record<string, Presentation[]> = {};
      for (const pres of result.data) {
        if (!map[pres.productId]) map[pres.productId] = [];
        map[pres.productId].push(pres);
      }
      set({ presentationsMap: map });
    }
  },

  getPresentations: (productId) => {
    return get().presentationsMap[productId] ?? [];
  },

  loadCategories: async (tenantId) => {
    const result = await inventoryService.getCategories(tenantId);
    if (result.ok) set({ categories: result.data });
  },

  setSelectedCategory: (categoryId) => set({ selectedCategory: categoryId }),

  restoreFavorites: async (tenantId) => {
    try {
      // TODO-L-08: localStorage directo — migrar a Dexie cuando se unifique almacenamiento offline.
      const raw = localStorage.getItem(`sasa-favorites-${tenantId}`);
      if (!raw) return;
      const productIds = JSON.parse(raw) as string[];
      if (!Array.isArray(productIds) || productIds.length === 0) return;
      const db = getDb();
      const now = new Date().toISOString();
      const existing = await db.productFavorites
        .where('[productId+tenantId]')
        .anyOf(productIds.map((id) => [id, tenantId]))
        .toArray();
      const existingIds = new Set(existing.map((f) => f.productId));
      const newFavorites = productIds
        .filter((id) => !existingIds.has(id))
        .map((id) => ({ productId: id, tenantId, createdAt: now }));
      if (newFavorites.length > 0) {
        await db.productFavorites.bulkAdd(newFavorites);
      }
    } catch (err) {
      logger.warn('POS', '[posStore] restoreFavorites failed:', err);
    }
  },

  toggleFavorite: async (tenantId, productId) => {
    await posService.toggleFavorite(tenantId, productId);
    const favResult = await posService.getFavorites(tenantId);
    const favIds = favResult.ok ? favResult.data : new Set<string>();
    set((state: CatalogGetter) => {
      const sorted = [...state.products].sort((a: Product, b: Product) => {
        const aFav = favIds.has(a.id) ? 1 : 0;
        const bFav = favIds.has(b.id) ? 1 : 0;
        return bFav - aFav;
      });
      return { favoriteProductIds: favIds, products: sorted };
    });
  },

  isFavorite: (productId) => {
    return get().favoriteProductIds.has(productId);
  },
});
