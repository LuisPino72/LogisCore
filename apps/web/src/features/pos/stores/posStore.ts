import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { preciseRound } from '@logiscore/shared';
import type { PosState, PaymentMethod, ParkedCart, PresentationSelection, CashRegister } from '../types';
import type { SaleItem } from '../types';
import type { Product } from '../../../specs/inventory';
import type { Presentation } from '../../../specs/inventory';
import { type Result, type AppError, success, failure, AppError as AppErrorClass } from '@logiscore/core';
import { posService } from '../services/posService';
import { inventoryService } from '../../../features/inventory/services/inventoryService';
import { useExchangeRateStore } from '../../../features/exchange/stores/exchangeRateStore';
import { imageCacheService } from '../../../services/imageCache/imageCacheService';
import { getDb } from '../../../services/dexie/db';
import { useAuthStore } from '../../auth/stores/authStore';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import type { CreateSaleInput } from '../../../specs/pos';
import type { Customer } from '../../../specs/customers';
import { MAX_PARKED_CARTS } from '../../../specs/pos';

interface PosStore extends PosState {
  fetchPresentations: (tenantId: string) => Promise<void>;
  getPresentations: (productId: string) => Presentation[];
  setDiscount: (type: 'percentage' | 'fixed', value: number) => void;
  clearDiscount: () => void;
  setSearchQuery: (query: string) => void;
  fetchProducts: (tenantId: string, silent?: boolean) => Promise<void>;
  restoreFavorites: (tenantId: string) => Promise<void>;
  fetchCashRegister: (tenantId: string, silent?: boolean) => Promise<void>;
  fetchParkedCarts: (tenantId: string) => Promise<void>;
  fetchSalesHistory: (tenantId: string, offset?: number, limit?: number, startDate?: string, endDate?: string) => Promise<void>;
  addToCart: (product: Product, quantity: number, presentation?: PresentationSelection) => Promise<boolean>;
  removeFromCart: (productId: string, presentationId?: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number, presentationId?: string) => Promise<void>;
  clearCart: () => void;
  parkCart: (tenantId: string, name: string) => Promise<boolean>;
  loadParkedCart: (cart: ParkedCart) => void;
  deleteParkedCart: (tenantId: string, id: string) => Promise<void>;
  toggleFavorite: (tenantId: string, productId: string) => Promise<void>;
  isFavorite: (productId: string) => boolean;
  completeSale: (tenantId: string, paymentMethod: PaymentMethod, userId: string) => Promise<Result<string, AppError>>;
  openCashRegister: (tenantId: string, openingBalance: number, userId: string, registerId?: string, registerName?: string) => Promise<Result<CashRegister, AppError>>;
  closeCashRegister: (tenantId: string, declaredClosingBalance: number, userId: string) => Promise<Result<CashRegister, AppError>>;
  voidSale: (saleId: string, tenantId: string, userId: string) => Promise<Result<void, AppError>>;
  getTodaySoldProducts: (tenantId: string, maxProducts?: number, referenceDate?: Date) => Promise<Result<Array<{ productId: string; productName: string; productSku: string; quantity: number }>, AppError>>;
  saleItems: SaleItem[];
  saleItemsLoading: boolean;
  fetchSaleItems: (tenantId: string, saleId: string) => Promise<void>;
  setSelectedCustomer: (customer: Customer | null) => void;
  isCreditSale: boolean;
  setIsCreditSale: (isCredit: boolean) => void;
  setActiveRegister: (registerId: string, sessionId: string, name: string) => void;
  clearActiveRegister: () => void;
  reset: () => void;
}

const initialState: PosState = {
  products: [],
  cart: [],
  cashRegister: null,
  parkedCarts: [],
  favoriteProductIds: new Set<string>(),
  salesHistory: [],
  salesHistoryTotal: 0,
  salesHistoryLoading: false,
  activeParkedCartId: null,
  activeRegisterId: null,
  activeSessionId: null,
  registerName: null,
  saleItems: [],
  saleItemsLoading: false,
  loading: false,
  error: null,
  searchQuery: '',
  presentationsMap: {},
  discount: null,
  assemblyRecipesMap: {},
  selectedCustomerId: null,
  selectedCustomer: null,
  isCreditSale: false,
};

async function validateAssemblyIngredients(
  recipeData: { lines: { productId: string; quantity: number }[]; wastePct: number },
  product: { id: string; name: string },
  quantity: number,
): Promise<string | null> {
  const wasteMultiplier = 1 + (recipeData.wastePct / 100);
  const db = getDb();
  const session = useAuthStore.getState().session;
  const ingredients = await Promise.all(recipeData.lines.map((line) => db.products.where({ id: line.productId, tenantId: session?.tenantId }).first()));
  for (let i = 0; i < recipeData.lines.length; i++) {
    const line = recipeData.lines[i];
    const ingredient = ingredients[i];
    const needed = Math.ceil(line.quantity * quantity * wasteMultiplier);
    if (!ingredient || ingredient.deletedAt || ingredient.stock < needed) {
      return `Stock insuficiente de ingrediente "${ingredient?.name || 'Desconocido'}" para "${product.name}". Necesario: ${needed}, Disponible: ${ingredient?.stock || 0}.`;
    }
  }
  return null;
}

export const usePosStore = create<PosStore>()(
  persist(
    (set, get) => ({
      ...initialState,

  setSearchQuery: (query) => set({ searchQuery: query }),

  fetchProducts: async (tenantId, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const [, result] = await Promise.all([
      get().restoreFavorites(tenantId),
      posService.getProductsForSale(tenantId),
    ]);
    if (result.ok) {
      const favResult = await posService.getFavorites(tenantId);
      const favIds = favResult.ok ? favResult.data : new Set<string>();

      const recipesMap: PosStore['assemblyRecipesMap'] = {};
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
      } catch {
        // Offline o DB cerrada — sin pre-validación
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

  setDiscount: (type, value) => {
    if (value <= 0) return;
    const maxDiscountPct = useSettingsStore.getState().maxDiscountPct;
    if (type === 'percentage' && (value > maxDiscountPct || value < 0)) return;
    if (type === 'fixed') {
      const { cart } = get();
      const subtotalUsd = cart.reduce((sum, item) => sum + item.totalPriceUsd, 0);
      if (value > subtotalUsd) return;
      const pctOfSubtotal = subtotalUsd > 0 ? (value / subtotalUsd) * 100 : 0;
      if (pctOfSubtotal > maxDiscountPct) return;
    }
    set({ discount: { type, value } });
  },

  clearDiscount: () => {
    set({ discount: null });
  },

  fetchCashRegister: async (tenantId, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const { activeSessionId } = get();
    if (activeSessionId) {
      const result = await posService.getSessionById(activeSessionId);
      if (result.ok) {
        set({ cashRegister: result.data, ...(!silent && { loading: false }) });
        return;
      }
    }
    const result = await posService.getOpenCashRegister(tenantId);
    if (result.ok) {
      set({ cashRegister: result.data, ...(!silent && { loading: false }) });
    } else if (!silent) {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchParkedCarts: async (tenantId) => {
    const result = await posService.getParkedCarts(tenantId);
    if (result.ok) {
      set({ parkedCarts: result.data });
    }
  },

  // POS-002 (M-16): restaura favoritos desde localStorage (escritos en logout).
  // Idempotente: skip si el favorite ya existe en Dexie.
  restoreFavorites: async (tenantId) => {
    try {
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
      console.warn('[posStore] restoreFavorites failed:', err);
    }
  },

  fetchSalesHistory: async (tenantId, offset = 0, limit = 50, startDate, endDate) => {
    set({ salesHistoryLoading: true, error: null });
    const result = await posService.getSalesHistory(tenantId, offset, limit, startDate, endDate);
    if (result.ok) {
      set({ salesHistory: result.data.sales, salesHistoryTotal: result.data.total, salesHistoryLoading: false });
    } else {
      set({ salesHistoryLoading: false, error: result.error.message });
    }
  },

  parkCart: async (tenantId, name) => {
    const { cart, parkedCarts } = get();
    if (cart.length === 0) {
      set({ error: 'No hay productos en el carrito.' });
      return false;
    }
    if (parkedCarts.length >= MAX_PARKED_CARTS) {
      set({ error: `Máximo ${MAX_PARKED_CARTS} ventas en cola. Completa o elimina una.` });
      return false;
    }
    const result = await posService.parkCart(tenantId, name, cart);
    if (result.ok) {
      set({ cart: [], activeParkedCartId: null, error: null });
      get().fetchParkedCarts(tenantId);
      return true;
    }
    console.error('[parkCart] Error:', result.error);
    set({ loading: false, error: result.error.message });
    return false;
  },

  loadParkedCart: (parked) => {
    set({ cart: parked.cart, activeParkedCartId: parked.id, error: null });
  },

  deleteParkedCart: async (tenantId, id) => {
    await posService.deleteParkedCart(tenantId, id);
    set((state) => ({
      parkedCarts: state.parkedCarts.filter((p) => p.id !== id),
    }));
  },

  toggleFavorite: async (tenantId, productId) => {
    await posService.toggleFavorite(tenantId, productId);
    const favResult = await posService.getFavorites(tenantId);
    const favIds = favResult.ok ? favResult.data : new Set<string>();
    set((state) => {
      const sorted = [...state.products].sort((a, b) => {
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

  addToCart: async (product, quantity, presentation?) => {
    const { cart } = get();
    set({ error: null });

    // Guard: rechazar productos con precio inválido (forzar Number por si viene como string de Dexie)
    const rawPrice = presentation?.priceUsd ?? product.priceUsd;
    const priceUsd = Number(rawPrice);
    if (!priceUsd || priceUsd <= 0 || !Number.isFinite(priceUsd)) {
      set({ error: `El precio de "${product.name}" no es válido (${rawPrice}). Verifica el producto.` });
      return false;
    }

      if (presentation) {
      const totalConsumption = cart
        .filter((item) => item.productId === product.id)
        .reduce((sum, item) => sum + item.quantity * item.unitMultiplier, 0);
      const requestedConsumption = quantity * (presentation.unitMultiplier || 1);
      const isAssembly = product.hasAssemblyRecipe;
      const presSafeStock = typeof product.stock === 'number' && Number.isFinite(product.stock) ? product.stock : 0;
      if (!isAssembly && totalConsumption + requestedConsumption > presSafeStock) {
        const available = Math.floor((presSafeStock - totalConsumption) / presentation.unitMultiplier);
        set({ error: `Stock insuficiente. Disponible: ${Math.max(0, available)} unidades.` });
        return false;
      }

      // A2: Pre-validación de ingredientes para productos assembly
      if (isAssembly) {
        const recipeData = get().assemblyRecipesMap[product.id];
        if (recipeData) {
          const error = await validateAssemblyIngredients(recipeData, product, quantity);
          if (error) {
            set({ error });
            return false;
          }
        }
      }

      const displayName = `${product.name} - ${presentation.name}`;
      const presUnitPrice = priceUsd;

      const existing = cart.find(
        (item) => item.productId === product.id && item.presentationId === presentation.id,
      );
      if (existing) {
        const newQty = existing.quantity + quantity;
        set({
          cart: cart.map((item) =>
            item.productId === product.id && item.presentationId === presentation.id
              ? {
                  ...item,
                  quantity: newQty,
                  totalPriceUsd: preciseRound(newQty * presUnitPrice, 2),
                }
              : item,
          ),
        });
      } else {
        set({
          cart: [
            ...cart,
            {
              productId: product.id,
              name: displayName,
              sku: product.sku,
              quantity,
              unitPriceUsd: presUnitPrice,
              totalPriceUsd: preciseRound(quantity * presUnitPrice, 2),
              isWeighted: false,
              isTaxable: product.isTaxable !== undefined ? product.isTaxable : true,
              unit: 'unidad',
              stock: presSafeStock,
              presentationId: presentation.id,
              presentationName: presentation.name,
              unitMultiplier: presentation.unitMultiplier || 1,
            },
          ],
        });
      }
      return true;
    }

    // Original behavior for products without presentations
    const currentQtyInCart = cart.find((item) => item.productId === product.id)?.quantity ?? 0;
    const totalRequested = currentQtyInCart + quantity;
    const isAssembly = product.hasAssemblyRecipe;
    // Sanitizar campos que pueden ser null/undefined en Dexie (Zod v4 rechaza null)
    const safeIsWeighted = product.isWeighted === true;
    const safeUnit = product.unit || 'unidad';
    const safeStock = typeof product.stock === 'number' && Number.isFinite(product.stock) ? product.stock : 0;
    // AUDIT-004: Pesable stock check (UI kg/lt, internals g/ml). totalRequested está en unidades de display;
    // product.stock está en unidades de almacenamiento. Comparar en mismas unidades.
    const stockInDisplayUnits = safeIsWeighted ? safeStock / 1000 : safeStock;
    if (!isAssembly && totalRequested > stockInDisplayUnits) {
      const available = safeUnit === 'kg' || safeUnit === 'lt'
        ? (safeStock / 1000).toFixed(2)
        : safeStock;
      set({ error: `Stock insuficiente. Disponible: ${available} ${safeUnit === 'lt' ? 'Lt' : safeUnit === 'kg' ? 'Kg' : ''}` });
      return false;
    }

    // A2: Pre-validación de ingredientes para productos assembly
    if (isAssembly) {
      const recipeData = get().assemblyRecipesMap[product.id];
      if (recipeData) {
          const error = await validateAssemblyIngredients(recipeData, product, totalRequested);
          if (error) {
            set({ error });
            return false;
          }
      }
    }
    const existing = cart.find((item) => item.productId === product.id);
    if (existing) {
      const foundProduct = get().products.find(p => p.id === product.id);
      const isAssemblyProd = foundProduct?.hasAssemblyRecipe;
      const maxQty = isAssemblyProd ? Infinity : (safeIsWeighted ? safeStock / 1000 : safeStock);
      const newQty = Math.min(preciseRound(existing.quantity + quantity, 2), maxQty);
      set({
        cart: cart.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: newQty, totalPriceUsd: preciseRound(newQty * item.unitPriceUsd, 2) }
            : item,
        ),
      });
    } else {
      const isAssemblyProd = product.hasAssemblyRecipe;
      const maxQty = isAssemblyProd ? Infinity : (safeIsWeighted ? safeStock / 1000 : safeStock);
      const finalQty = Math.min(quantity, maxQty);
      set({
        cart: [
          ...cart,
          {
            productId: product.id,
            name: product.name,
            sku: product.sku,
            quantity: finalQty,
            unitPriceUsd: priceUsd,
            totalPriceUsd: preciseRound(finalQty * priceUsd, 2),
            isWeighted: safeIsWeighted,
            isTaxable: product.isTaxable !== undefined ? product.isTaxable : true,
            unit: safeUnit,
            stock: safeStock,
            unitMultiplier: 1,
          },
        ],
      });
    }
    return true;
  },

  removeFromCart: (productId, presentationId?: string) => {
    if (presentationId) {
      set({ cart: get().cart.filter((item) => !(item.productId === productId && item.presentationId === presentationId)) });
    } else {
      set({ cart: get().cart.filter((item) => item.productId !== productId) });
    }
  },

  updateCartItemQuantity: async (productId, quantity, presentationId?: string) => {
    const cartItem = get().cart.find(item => item.productId === productId && (!presentationId || item.presentationId === presentationId));
    if (!cartItem) return;

    if (quantity <= 0) {
      get().removeFromCart(productId, presentationId);
      return;
    }

    let maxQty: number;
    if (cartItem.presentationId) {
      const product = get().products.find(p => p.id === productId);
      if (!product) { get().removeFromCart(productId, presentationId); return; }
      const isAssemblyProd = product.hasAssemblyRecipe;
      if (isAssemblyProd) {
        maxQty = Infinity;
      } else {
        const totalConsumption = get().cart
          .filter((item) => item.productId === productId && item.presentationId !== presentationId)
          .reduce((sum, item) => sum + item.quantity * item.unitMultiplier, 0);
        const availableBase = Math.max(0, product.stock - totalConsumption);
        maxQty = Math.floor(availableBase / (cartItem.unitMultiplier || 1));
      }
    } else {
      const product = get().products.find(p => p.id === productId);
      if (!product) { get().removeFromCart(productId, presentationId); return; }
      const isAssemblyProd = product.hasAssemblyRecipe;
      const safeStock = typeof product.stock === 'number' && Number.isFinite(product.stock) ? product.stock : 0;
      const safeIsWeighted = product.isWeighted === true;
      maxQty = isAssemblyProd ? Infinity : (safeIsWeighted ? safeStock / 1000 : safeStock);
    }

    // A2: Pre-validación de ingredientes para productos assembly
    const product = get().products.find(p => p.id === productId);
    if (product?.hasAssemblyRecipe) {
      const recipeData = get().assemblyRecipesMap[productId];
      if (recipeData) {
        const wasteMultiplier = 1 + (recipeData.wastePct / 100);
        const db = getDb();
        for (const line of recipeData.lines) {
          const needed = Math.ceil(line.quantity * quantity * wasteMultiplier);
          const session = useAuthStore.getState().session;
          const ingredient = await db.products.where({ id: line.productId, tenantId: session?.tenantId }).first();
          if (!ingredient || ingredient.deletedAt || ingredient.stock < needed) {
            set({ error: `Stock insuficiente de ingrediente "${ingredient?.name || 'Desconocido'}" para "${product.name}". Necesario: ${needed}, Disponible: ${ingredient?.stock || 0}.` });
            return;
          }
        }
      }
    }

    const finalQty = Math.min(quantity, maxQty);

    set({
      cart: get().cart.map((item) =>
        item.productId === productId && (!presentationId || item.presentationId === presentationId)
          ? { ...item, quantity: finalQty, totalPriceUsd: preciseRound(finalQty * item.unitPriceUsd, 2) }
          : item,
      ),
    });
  },

  clearCart: () => set({ cart: [] }),

  setSelectedCustomer: (customer) => set({
    selectedCustomerId: customer?.id ?? null,
    selectedCustomer: customer,
    isCreditSale: false, // Reset credit sale when changing customer
  }),

  setIsCreditSale: (isCredit) => set({ isCreditSale: isCredit }),

  setActiveRegister: (registerId, sessionId, name) => set({
    activeRegisterId: registerId,
    activeSessionId: sessionId,
    registerName: name,
  }),

  clearActiveRegister: () => set({
    activeRegisterId: null,
    activeSessionId: null,
    registerName: null,
    cashRegister: null,
  }),

  completeSale: async (tenantId, paymentMethod, userId) => {
    const { cart, selectedCustomerId, isCreditSale } = get();
    if (cart.length === 0) {
      set({ error: 'No hay productos en el carrito.' });
      return failure(new AppErrorClass('SALE_NO_ITEMS', 'No hay productos en el carrito.'));
    }

    let exchangeRate = useExchangeRateStore.getState().rate ?? 0;
    if (!exchangeRate || exchangeRate <= 0) {
      await useExchangeRateStore.getState().fetchLatest(tenantId);
      exchangeRate = useExchangeRateStore.getState().rate ?? 0;
    }

    if (!exchangeRate || exchangeRate <= 0) {
      set({ error: 'No hay tasa de cambio disponible. Configúrala antes de vender.', loading: false });
      return failure(new AppErrorClass('SALE_FAILED', 'No hay tasa de cambio disponible. Configúrala antes de vender.'));
    }

    const { discount } = get();
    // Sanitizar items del carrito antes de enviar a Zod (protege contra sessionStorage corrupto)
    const sanitizedItems = cart.map((item) => ({
      ...item,
      quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
      unitPriceUsd: typeof item.unitPriceUsd === 'number' && Number.isFinite(item.unitPriceUsd) && item.unitPriceUsd > 0 ? item.unitPriceUsd : 0,
      totalPriceUsd: typeof item.totalPriceUsd === 'number' && Number.isFinite(item.totalPriceUsd) && item.totalPriceUsd > 0 ? item.totalPriceUsd : 0,
      stock: typeof item.stock === 'number' && Number.isFinite(item.stock) ? item.stock : 0,
      isWeighted: item.isWeighted === true,
      unit: typeof item.unit === 'string' && item.unit ? item.unit : 'unidad',
      unitMultiplier: typeof item.unitMultiplier === 'number' && item.unitMultiplier > 0 ? item.unitMultiplier : 1,
    }));
    const { activeSessionId } = get();
    const input: CreateSaleInput = {
      tenantId,
      userId,
      paymentMethod,
      items: sanitizedItems,
      exchangeRate,
      ...(discount && { discountType: discount.type, discountValue: discount.value }),
      ...(selectedCustomerId && { customerId: selectedCustomerId }),
      isCreditSale: isCreditSale && paymentMethod === 'credito',
      cashRegisterId: activeSessionId ?? undefined,
    };

    set({ loading: true, error: null });
    const result = await posService.createSale(input);
    if (result.ok) {
      const activeId = get().activeParkedCartId;
      if (activeId) {
        await posService.deleteParkedCart(tenantId, activeId);
      }
      set({
        discount: null,
        loading: false,
        cart: [],
        activeParkedCartId: null,
        selectedCustomerId: null,
        selectedCustomer: null,
        isCreditSale: false,
      });
      if (activeId) {
        const remaining = get().parkedCarts.filter((p) => p.id !== activeId);
        set({ parkedCarts: remaining });
      }
      return success(result.data.id);
    }
    set({ loading: false, error: result.error.message });
    return failure(new AppErrorClass('SALE_FAILED', result.error.message));
  },

  openCashRegister: async (tenantId, openingBalance, userId, registerId?, registerName?) => {
    set({ loading: true, error: null });
    const rate = useExchangeRateStore.getState().rate;
    if (!rate || rate <= 0) {
      set({ error: 'No hay tasa de cambio disponible. Configure la tasa antes de abrir la caja.', loading: false });
      return failure(new AppErrorClass('SALE_FAILED', 'No hay tasa de cambio disponible. Configure la tasa antes de abrir la caja.'));
    }
    const resolvedRegisterId = registerId ?? get().activeRegisterId;
    const result = await posService.openCashRegister({ tenantId, userId, openingBalanceBs: openingBalance, openingRate: rate, registerId: resolvedRegisterId ?? undefined });
    if (result.ok) {
      const reg = result.data;
      const regName = registerName ?? get().registerName ?? (reg.registerId ? 'Caja' : 'Caja Principal');
      get().setActiveRegister(reg.registerId ?? resolvedRegisterId ?? reg.id, reg.id, regName);
      set({ cashRegister: reg, loading: false });
      return success(reg);
    }
    set({ loading: false, error: result.error.message });
    return failure(new AppErrorClass('SALE_FAILED', result.error.message));
  },

  closeCashRegister: async (tenantId, declaredClosingBalance, userId) => {
    set({ loading: true, error: null });
    const rate = useExchangeRateStore.getState().rate;
    if (!rate || rate <= 0) {
      set({ error: 'No hay tasa de cambio disponible. Verifique la tasa antes de cerrar la caja.', loading: false });
      return failure(new AppErrorClass('SALE_FAILED', 'No hay tasa de cambio disponible. Verifique la tasa antes de cerrar la caja.'));
    }
    const { activeSessionId } = get();
    const result = await posService.closeCashRegister({
      tenantId, userId, declaredClosingBalanceBs: declaredClosingBalance,
      closingRate: rate, sessionId: activeSessionId ?? undefined,
    });
    if (result.ok) {
      get().clearActiveRegister();
      set({ cashRegister: result.data, loading: false });
      return success(result.data);
    }
    set({ loading: false, error: result.error.message });
    return failure(new AppErrorClass('SALE_FAILED', result.error.message));
  },

  voidSale: async (saleId, tenantId, userId) => {
    const result = await posService.voidSale(saleId, tenantId, userId);
    if (result.ok) {
      set({ error: null });
      return result;
    }
    set({ error: result.error.message });
    return result;
  },

  getTodaySoldProducts: async (tenantId, maxProducts?, referenceDate?) => {
    return posService.getTodaySoldProducts(tenantId, maxProducts, referenceDate);
  },

  saleItems: [],
  saleItemsLoading: false,

  fetchSaleItems: async (tenantId, saleId) => {
    set({ saleItemsLoading: true });
    const result = await posService.getSaleItems(tenantId, saleId);
    if (result.ok) {
      set({ saleItems: result.data, saleItemsLoading: false });
    } else {
      set({ saleItems: [], saleItemsLoading: false });
    }
  },

  reset: () => set(initialState),
    }),
    {
      name: 'logiscore-pos-cart',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        cart: state.cart,
        activeParkedCartId: state.activeParkedCartId,
        discount: state.discount,
        activeSessionId: state.activeSessionId,
        activeRegisterId: state.activeRegisterId,
        registerName: state.registerName,
      }),
    },
  ),
);
