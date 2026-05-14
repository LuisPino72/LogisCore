import { create } from 'zustand';
import type { PosState, PaymentMethod, ParkedCart } from '../types';
import type { Product } from '../../../specs/inventory';
import { posService } from '../services/posService';
import { exchangeRateService } from '../../../features/exchange/services/exchangeRateService';
import type { CreateSaleInput } from '../../../specs/pos';
import { getDb } from '../../../services/dexie/db';

const MAX_PARKED_CARTS = 10;

interface PosStore extends PosState {
  setSearchQuery: (query: string) => void;
  fetchProducts: (tenantId: string) => Promise<void>;
  fetchCashRegister: (tenantId: string) => Promise<void>;
  fetchExchangeRate: (tenantId: string) => Promise<void>;
  fetchParkedCarts: (tenantId: string) => Promise<void>;
  fetchSalesHistory: (tenantId: string) => Promise<void>;
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
  activeParkedCartId: null,
  loading: false,
  error: null,
  searchQuery: '',
};

function preciseRound(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export const usePosStore = create<PosStore>((set, get) => ({
  ...initialState,

  setSearchQuery: (query) => set({ searchQuery: query }),

  fetchProducts: async (tenantId) => {
    set({ loading: true, error: null });
    const result = await posService.getProductsForSale(tenantId);
    if (result.ok) {
      const db = getDb();
      const favs = await db.productFavorites.where({ tenantId }).toArray();
      const favIds = new Set(favs.map((f) => f.productId));
      const sorted = [...result.data].sort((a, b) => {
        const aFav = favIds.has(a.id) ? 1 : 0;
        const bFav = favIds.has(b.id) ? 1 : 0;
        return bFav - aFav;
      });
      set({ products: sorted, favoriteProductIds: favIds, loading: false });
    } else {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchCashRegister: async (tenantId) => {
    set({ loading: true, error: null });
    const result = await posService.getCashRegister(tenantId);
    if (result.ok) {
      set({ cashRegister: result.data, loading: false });
    } else {
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
    const db = getDb();
    const rows = await db.parkedCarts
      .where({ tenantId })
      .sortBy('createdAt');
    set({
      parkedCarts: rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        name: r.name,
        cart: JSON.parse(r.cartJson) as ParkedCart['cart'],
        createdAt: r.createdAt,
      })),
    });
  },

  fetchSalesHistory: async (tenantId) => {
    set({ loading: true, error: null });
    const result = await posService.getSalesHistory(tenantId);
    if (result.ok) {
      set({ salesHistory: result.data, loading: false });
    } else {
      set({ loading: false, error: result.error.message });
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
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.parkedCarts.add({
      id,
      tenantId,
      name: name.trim() || `Venta #${parkedCarts.length + 1}`,
      cartJson: JSON.stringify(cart),
      createdAt: now,
    });
    set({ cart: [], activeParkedCartId: null, error: null });
    get().fetchParkedCarts(tenantId);
    return true;
  },

  loadParkedCart: (parked) => {
    set({ cart: parked.cart, activeParkedCartId: parked.id, error: null });
  },

  deleteParkedCart: async (id) => {
    const db = getDb();
    await db.parkedCarts.delete(id);
    set((state) => ({
      parkedCarts: state.parkedCarts.filter((p) => p.id !== id),
    }));
  },

  toggleFavorite: async (tenantId, productId) => {
    const db = getDb();
    const existing = await db.productFavorites.get([productId, tenantId]);
    if (existing) {
      await db.productFavorites.delete([productId, tenantId]);
    } else {
      await db.productFavorites.add({ productId, tenantId, createdAt: new Date().toISOString() });
    }
    const favs = await db.productFavorites.where({ tenantId }).toArray();
    const favIds = new Set(favs.map((f) => f.productId));
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
    const { cart } = get();
    if (cart.length === 0) {
      set({ error: 'No hay productos en el carrito.' });
      return false;
    }

    const exchangeRateResult = await exchangeRateService.fetchLatest(tenantId);

    let exchangeRate = 0;
    if (exchangeRateResult.ok && exchangeRateResult.data && exchangeRateResult.data.rate) {
      exchangeRate = exchangeRateResult.data.rate;
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
        const db = getDb();
        await db.parkedCarts.delete(activeId);
      }
      set({ loading: false, cart: [], exchangeRate: null, activeParkedCartId: null });
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
