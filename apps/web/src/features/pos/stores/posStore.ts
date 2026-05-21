import { create } from 'zustand';
import { preciseRound } from '@logiscore/shared';
import type { PosState, PaymentMethod, ParkedCart } from '../types';
import type { Product } from '../../../specs/inventory';
import { posService } from '../services/posService';
import { exchangeRateService } from '../../../features/exchange/services/exchangeRateService';
import { imageCacheService } from '../../../services/imageCache/imageCacheService';
import type { CreateSaleInput } from '../../../specs/pos';

const MAX_PARKED_CARTS = 10;

interface PosStore extends PosState {
  setSearchQuery: (query: string) => void;
  fetchProducts: (tenantId: string, silent?: boolean) => Promise<void>;
  fetchCashRegister: (tenantId: string, silent?: boolean) => Promise<void>;
  fetchExchangeRate: (tenantId: string) => Promise<void>;
  fetchParkedCarts: (tenantId: string) => Promise<void>;
  fetchSalesHistory: (tenantId: string, offset?: number, limit?: number, startDate?: string, endDate?: string) => Promise<void>;
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
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
};

export const usePosStore = create<PosStore>((set, get) => ({
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

  addToCart: (product, quantity) => {
    const { cart } = get();
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
      const newQty = preciseRound(existing.quantity + quantity, 2);
      set({
        cart: cart.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: newQty,
                totalPriceUsd: preciseRound(newQty * item.unitPriceUsd, 2),
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
            name: product.name,
            sku: product.sku,
            quantity,
            unitPriceUsd: product.priceUsd,
            totalPriceUsd: preciseRound(quantity * product.priceUsd, 2),
            isWeighted: product.isWeighted,
            isTaxable: product.isTaxable !== undefined ? product.isTaxable : true,
            unit: product.unit,
          },
        ],
      });
    }
  },

  removeFromCart: (productId) => {
    set({ cart: get().cart.filter((item) => item.productId !== productId) });
  },

  updateCartItemQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(productId);
      return;
    }
    set({
      cart: get().cart.map((item) =>
        item.productId === productId
          ? { ...item, quantity, totalPriceUsd: preciseRound(quantity * item.unitPriceUsd, 2) }
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
    if (!exchangeRate) {
      const exchangeRateResult = await exchangeRateService.fetchLatest(tenantId);
      if (exchangeRateResult.ok && exchangeRateResult.data?.rate) {
        exchangeRate = exchangeRateResult.data.rate;
      }
    }

    const input: CreateSaleInput = {
      tenantId,
      userId,
      paymentMethod,
      items: cart,
      exchangeRate,
    };

    set({ loading: true, error: null });
    const result = await posService.createSale(input);
    if (result.ok) {
      const activeId = get().activeParkedCartId;
      if (activeId) {
        await posService.deleteParkedCart(activeId);
      }
      set({ loading: false, cart: [], activeParkedCartId: null });
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
    const result = await posService.openCashRegister({ tenantId, userId, openingBalanceBs: openingBalance });
    if (result.ok) {
      set({ cashRegister: result.data, loading: false });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  closeCashRegister: async (tenantId, declaredClosingBalance, userId) => {
    set({ loading: true, error: null });
    const result = await posService.closeCashRegister({ tenantId, userId, declaredClosingBalanceBs: declaredClosingBalance });
    if (result.ok) {
      set({ cashRegister: result.data, loading: false });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  reset: () => set(initialState),
}));
