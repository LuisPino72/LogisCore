import { posService } from '../services/posService';
import { inventoryService } from '../../../features/inventory/services/inventoryService';
import { MAX_PARKED_CARTS } from '../../../specs/pos';
import type { ParkedCart, SaleItem, Sale } from '../types';
import type { Product } from '../../../specs/inventory';

export interface PosHistorySlice {
  salesHistory: Sale[];
  salesHistoryTotal: number;
  salesHistoryLoading: boolean;
  saleItems: SaleItem[];
  saleItemsLoading: boolean;
  parkedCarts: ParkedCart[];
  activeParkedCartId: string | null;
  lowStockAlert: Product[];
  fetchSalesHistory: (tenantId: string, offset?: number, limit?: number, startDate?: string, endDate?: string) => Promise<void>;
  fetchSaleItems: (tenantId: string, saleId: string) => Promise<void>;
  fetchParkedCarts: (tenantId: string) => Promise<void>;
  parkCart: (tenantId: string, name: string, deliveryInfo?: { orderType?: 'dine-in' | 'delivery'; needsKitchen?: boolean }) => Promise<boolean>;
  loadParkedCart: (cart: ParkedCart) => void;
  deleteParkedCart: (tenantId: string, id: string) => Promise<void>;
  loadLowStockAlert: (tenantId: string) => Promise<void>;
}

export const initialHistoryState = {
  salesHistory: [] as Sale[],
  salesHistoryTotal: 0,
  salesHistoryLoading: false,
  saleItems: [] as SaleItem[],
  saleItemsLoading: false,
  parkedCarts: [] as ParkedCart[],
  activeParkedCartId: null as string | null,
  lowStockAlert: [] as Product[],
};

type HistoryGetter = PosHistorySlice & {
  cart: import('../types').CartItem[];
  loading: boolean;
  error: string | null;
};

export const createHistorySlice = (set: any, get: () => HistoryGetter): PosHistorySlice => ({
  ...initialHistoryState,

  fetchSalesHistory: async (tenantId, offset = 0, limit = 50, startDate?, endDate?) => {
    set({ salesHistoryLoading: true, error: null });
    const result = await posService.getSalesHistory(tenantId, offset, limit, startDate, endDate);
    if (result.ok) {
      set({ salesHistory: result.data.sales, salesHistoryTotal: result.data.total, salesHistoryLoading: false });
    } else {
      set({ salesHistoryLoading: false, error: result.error.message });
    }
  },

  fetchSaleItems: async (tenantId, saleId) => {
    set({ saleItemsLoading: true });
    const result = await posService.getSaleItems(tenantId, saleId);
    if (result.ok) {
      set({ saleItems: result.data, saleItemsLoading: false });
    } else {
      set({ saleItems: [], saleItemsLoading: false });
    }
  },

  fetchParkedCarts: async (tenantId) => {
    const result = await posService.getParkedCarts(tenantId);
    if (result.ok) {
      set({ parkedCarts: result.data });
    }
  },

  parkCart: async (tenantId, name, deliveryInfo?) => {
    const { cart, parkedCarts } = get();
    if (cart.length === 0) {
      set({ error: 'No hay productos en el carrito.' });
      return false;
    }
    if (parkedCarts.length >= MAX_PARKED_CARTS) {
      set({ error: `Máximo ${MAX_PARKED_CARTS} ventas en cola. Completa o elimina una.` });
      return false;
    }
    const result = await posService.parkCart(tenantId, name, cart, undefined, deliveryInfo);
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
    set((state: HistoryGetter) => ({
      parkedCarts: state.parkedCarts.filter((p: ParkedCart) => p.id !== id),
      ...(state.activeParkedCartId === id ? { cart: [], activeParkedCartId: null } : {}),
    }));
  },

  loadLowStockAlert: async (tenantId) => {
    const result = await inventoryService.getLowStockProducts(tenantId);
    if (result.ok) set({ lowStockAlert: result.data });
  },
});
