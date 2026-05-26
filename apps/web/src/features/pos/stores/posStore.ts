import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { preciseRound } from '@logiscore/shared';
import type { PosState, PaymentMethod, ParkedCart, PresentationSelection } from '../types';
import type { Product } from '../../../specs/inventory';
import type { Presentation } from '../../../specs/inventory';
import { posService } from '../services/posService';
import { inventoryService } from '../../../features/inventory/services/inventoryService';
import { exchangeRateService } from '../../../features/exchange/services/exchangeRateService';
import { imageCacheService } from '../../../services/imageCache/imageCacheService';
import type { CreateSaleInput } from '../../../specs/pos';

const MAX_PARKED_CARTS = 10;

interface PosStore extends PosState {
  fetchPresentations: (tenantId: string) => Promise<void>;
  getPresentations: (productId: string) => Presentation[];
  setDiscount: (type: 'percentage' | 'fixed', value: number) => void;
  clearDiscount: () => void;
  setSearchQuery: (query: string) => void;
  fetchProducts: (tenantId: string, silent?: boolean) => Promise<void>;
  fetchCashRegister: (tenantId: string, silent?: boolean) => Promise<void>;
  fetchExchangeRate: (tenantId: string) => Promise<void>;
  fetchParkedCarts: (tenantId: string) => Promise<void>;
  fetchSalesHistory: (tenantId: string, offset?: number, limit?: number, startDate?: string, endDate?: string) => Promise<void>;
  addToCart: (product: Product, quantity: number, presentation?: PresentationSelection) => void;
  removeFromCart: (productId: string, presentationId?: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number, presentationId?: string) => void;
  clearCart: () => void;
  parkCart: (tenantId: string, name: string) => Promise<boolean>;
  loadParkedCart: (cart: ParkedCart) => void;
  deleteParkedCart: (id: string) => Promise<void>;
  toggleFavorite: (tenantId: string, productId: string) => Promise<void>;
  isFavorite: (productId: string) => boolean;
  completeSale: (tenantId: string, paymentMethod: PaymentMethod, userId: string) => Promise<boolean>;
  openCashRegister: (tenantId: string, openingBalance: number, userId: string) => Promise<boolean>;
  closeCashRegister: (tenantId: string, declaredClosingBalance: number, userId: string) => Promise<boolean>;
  reset: () => void;
}

const initialState: PosState = {
  products: [],
  cart: [],
  cashRegister: null,
  exchangeRate: null,
  parkedCarts: [],
  favoriteProductIds: new Set<string>(),
  salesHistory: [],
  salesHistoryTotal: 0,
  salesHistoryLoading: false,
  activeParkedCartId: null,
  loading: false,
  error: null,
  searchQuery: '',
  presentationsMap: {},
  childProductIds: new Set<string>(),
  discount: null,
};

export const usePosStore = create<PosStore>()(
  persist(
    (set, get) => ({
      ...initialState,

  setSearchQuery: (query) => set({ searchQuery: query }),

  fetchProducts: async (tenantId, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const result = await posService.getProductsForSale(tenantId);
    if (result.ok) {
      const favResult = await posService.getFavorites(tenantId);
      const favIds = favResult.ok ? favResult.data : new Set<string>();
      const sorted = [...result.data].sort((a, b) => {
        const aFav = favIds.has(a.id) ? 1 : 0;
        const bFav = favIds.has(b.id) ? 1 : 0;
        return bFav - aFav;
      });
      set({ products: sorted, favoriteProductIds: favIds, ...(!silent && { loading: false }) });
      imageCacheService.preloadAll(result.data);
    } else if (!silent) {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchPresentations: async (tenantId) => {
    const result = await inventoryService.getAllPresentations(tenantId);
    if (result.ok) {
      const map: Record<string, Presentation[]> = {};
      const childIds = new Set<string>();
      for (const pres of result.data) {
        if (!map[pres.productId]) map[pres.productId] = [];
        map[pres.productId].push(pres);
        if (pres.stockType === 'independent' && pres.childProductId) {
          childIds.add(pres.childProductId);
        }
      }
      set((s) => ({
        presentationsMap: map,
        childProductIds: childIds,
        products: s.products.filter((p) => !childIds.has(p.id)),
      }));
    }
  },

  getPresentations: (productId) => {
    return get().presentationsMap[productId] ?? [];
  },

  setDiscount: (type, value) => {
    set({ discount: { type, value } });
  },

  clearDiscount: () => {
    set({ discount: null });
  },

  fetchCashRegister: async (tenantId, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const result = await posService.getCashRegister(tenantId);
    if (result.ok) {
      set({ cashRegister: result.data, ...(!silent && { loading: false }) });
    } else if (!silent) {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchExchangeRate: async (tenantId) => {
    const result = await exchangeRateService.fetchLatest(tenantId);
    if (result.ok && result.data) {
      set({ exchangeRate: result.data.rate });
    }
  },

  fetchParkedCarts: async (tenantId) => {
    const result = await posService.getParkedCarts(tenantId);
    if (result.ok) {
      set({ parkedCarts: result.data });
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
    console.error('[completeSale] Error:', result.error);
    set({ loading: false, error: result.error.message });
    return false;
  },

  loadParkedCart: (parked) => {
    set({ cart: parked.cart, activeParkedCartId: parked.id, error: null });
  },

  deleteParkedCart: async (id) => {
    await posService.deleteParkedCart(id);
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

  addToCart: (product, quantity, presentation?) => {
    const { cart } = get();
    set({ error: null });

    if (presentation) {
      // Global Stock Validation for shared mode
      if (presentation.stockType === 'shared') {
        const totalConsumption = cart
          .filter((item) => item.productId === product.id)
          .reduce((sum, item) => sum + item.quantity * item.unitMultiplier, 0);
        const requestedConsumption = quantity * (presentation.unitMultiplier || 1);
        if (totalConsumption + requestedConsumption > product.stock) {
          const available = Math.floor((product.stock - totalConsumption) / presentation.unitMultiplier);
          set({ error: `Stock insuficiente. Disponible: ${Math.max(0, available)} unidades.` });
          return;
        }
      }

      // For independent, find child product stock
      if (presentation.stockType === 'independent' && presentation.childProductId) {
        const childProduct = get().products.find((p) => p.id === presentation.childProductId);
        if (!childProduct || childProduct.stock < quantity) {
          set({ error: `Stock insuficiente para "${presentation.name}".` });
          return;
        }
      }

      const presProductId = presentation.stockType === 'independent' && presentation.childProductId
        ? presentation.childProductId
        : product.id;
      const displayName = `${product.name} - ${presentation.name}`;
      const presUnitPrice = presentation.priceUsd;

      const existing = cart.find(
        (item) => item.productId === presProductId && item.presentationId === presentation.id,
      );
      if (existing) {
        const newQty = existing.quantity + quantity;
        set({
          cart: cart.map((item) =>
            item.productId === presProductId && item.presentationId === presentation.id
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
              productId: presProductId,
              name: displayName,
              sku: product.sku,
              quantity,
              unitPriceUsd: presUnitPrice,
              totalPriceUsd: preciseRound(quantity * presUnitPrice, 2),
              isWeighted: false,
              isTaxable: product.isTaxable !== undefined ? product.isTaxable : true,
              unit: 'unidad',
              stock: presentation.stockType === 'independent' && presentation.childProductId
                ? (get().products.find(p => p.id === presentation.childProductId)?.stock ?? 0)
                : product.stock,
              presentationId: presentation.id,
              presentationName: presentation.name,
              unitMultiplier: presentation.unitMultiplier || 1,
              stockType: presentation.stockType,
            },
          ],
        });
      }
      return;
    }

    // Original behavior for products without presentations
    const currentQtyInCart = cart.find((item) => item.productId === product.id)?.quantity ?? 0;
    const totalRequested = currentQtyInCart + quantity;
    if (totalRequested > product.stock) {
      const available = product.unit === 'kg' || product.unit === 'lt'
        ? (product.stock / 1000).toFixed(2)
        : product.stock;
      set({ error: `Stock insuficiente. Disponible: ${available} ${product.unit === 'lt' ? 'Lt' : product.unit === 'kg' ? 'Kg' : ''}` });
      return;
    }
    const existing = cart.find((item) => item.productId === product.id);
    if (existing) {
      const foundProduct = get().products.find(p => p.id === product.id);
      const maxQty = foundProduct?.isWeighted ? (foundProduct?.stock ?? 0) / 1000 : (foundProduct?.stock ?? 0);
      const newQty = Math.min(preciseRound(existing.quantity + quantity, 2), maxQty);
      set({
        cart: cart.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: newQty, totalPriceUsd: preciseRound(newQty * item.unitPriceUsd, 2) }
            : item,
        ),
      });
    } else {
      const maxQty = product.isWeighted ? product.stock / 1000 : product.stock;
      const finalQty = Math.min(quantity, maxQty);
      set({
        cart: [
          ...cart,
          {
            productId: product.id,
            name: product.name,
            sku: product.sku,
            quantity: finalQty,
            unitPriceUsd: product.priceUsd,
            totalPriceUsd: preciseRound(finalQty * product.priceUsd, 2),
            isWeighted: product.isWeighted,
            isTaxable: product.isTaxable !== undefined ? product.isTaxable : true,
            unit: product.unit,
            stock: product.stock,
            unitMultiplier: 1,
          },
        ],
      });
    }
  },

  removeFromCart: (productId, presentationId?: string) => {
    if (presentationId) {
      set({ cart: get().cart.filter((item) => !(item.productId === productId && item.presentationId === presentationId)) });
    } else {
      set({ cart: get().cart.filter((item) => item.productId !== productId) });
    }
  },

  updateCartItemQuantity: (productId, quantity, presentationId?: string) => {
    const cartItem = get().cart.find(item => item.productId === productId && (!presentationId || item.presentationId === presentationId));
    if (!cartItem) return;

    if (quantity <= 0) {
      get().removeFromCart(productId, presentationId);
      return;
    }

    let maxQty: number;
    if (cartItem.stockType === 'shared') {
      const product = get().products.find(p => p.id === productId);
      if (!product) { get().removeFromCart(productId, presentationId); return; }
      const totalConsumption = get().cart
        .filter((item) => item.productId === productId && item.presentationId !== presentationId)
        .reduce((sum, item) => sum + item.quantity * item.unitMultiplier, 0);
      const availableBase = Math.max(0, product.stock - totalConsumption);
      maxQty = Math.floor(availableBase / (cartItem.unitMultiplier || 1));
    } else if (cartItem.stockType === 'independent' && cartItem.productId) {
      const childProduct = get().products.find(p => p.id === cartItem.productId);
      maxQty = childProduct ? childProduct.stock : 0;
    } else {
      const product = get().products.find(p => p.id === productId);
      if (!product) { get().removeFromCart(productId, presentationId); return; }
      maxQty = product.isWeighted ? product.stock / 1000 : product.stock;
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

  completeSale: async (tenantId, paymentMethod, userId) => {
    const { cart, exchangeRate: cachedRate } = get();
    if (cart.length === 0) {
      set({ error: 'No hay productos en el carrito.' });
      return false;
    }

    let exchangeRate = cachedRate ?? 0;
    if (!exchangeRate || exchangeRate <= 0) {
      const exchangeRateResult = await exchangeRateService.fetchLatest(tenantId);
      if (exchangeRateResult.ok && exchangeRateResult.data?.rate) {
        exchangeRate = exchangeRateResult.data.rate;
      }
    }

    if (!exchangeRate || exchangeRate <= 0) {
      set({ error: 'No hay tasa de cambio disponible. Configúrala antes de vender.', loading: false });
      return false;
    }

    const { discount } = get();
    const input: CreateSaleInput = {
      tenantId,
      userId,
      paymentMethod,
      items: cart,
      exchangeRate,
      ...(discount && { discountType: discount.type, discountValue: discount.value }),
    };

    set({ loading: true, error: null });
    const result = await posService.createSale(input);
    if (result.ok) {
      const activeId = get().activeParkedCartId;
      if (activeId) {
        await posService.deleteParkedCart(activeId);
      }
      set({ discount: null, loading: false, cart: [], activeParkedCartId: null });
      if (activeId) {
        const remaining = get().parkedCarts.filter((p) => p.id !== activeId);
        set({ parkedCarts: remaining });
      }
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  openCashRegister: async (tenantId, openingBalance, userId) => {
    set({ loading: true, error: null });
    const rate = get().exchangeRate;
    if (!rate || rate <= 0) {
      set({ error: 'No hay tasa de cambio disponible. Configure la tasa antes de abrir la caja.', loading: false });
      return false;
    }
    const result = await posService.openCashRegister({ tenantId, userId, openingBalanceBs: openingBalance, openingRate: rate });
    if (result.ok) {
      set({ cashRegister: result.data, loading: false });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  closeCashRegister: async (tenantId, declaredClosingBalance, userId) => {
    set({ loading: true, error: null });
    const rate = get().exchangeRate;
    if (!rate || rate <= 0) {
      set({ error: 'No hay tasa de cambio disponible. Verifique la tasa antes de cerrar la caja.', loading: false });
      return false;
    }
    const result = await posService.closeCashRegister({ tenantId, userId, declaredClosingBalanceBs: declaredClosingBalance, closingRate: rate });
    if (result.ok) {
      set({ cashRegister: result.data, loading: false });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
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
      }),
    },
  ),
);
