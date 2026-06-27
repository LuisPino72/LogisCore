import { posService } from '../services/posService';
import { inventoryService } from '../../../features/inventory/services/inventoryService';
import { MAX_PARKED_CARTS } from '../../../specs/pos';
import { logger } from '../../../lib/logger';
import { type Result, type AppError, failure, AppError as AppErrorClass } from '@logiscore/core';
import { useToastStore } from '../../../stores/toastStore';
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
  parkCart: (tenantId: string, name: string, deliveryInfo?: { orderType?: 'dine-in' | 'delivery'; needsKitchen?: boolean }) => Promise<Result<string, AppError>>;
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

export const createHistorySlice = (set: (setter: Partial<HistoryGetter> | ((state: HistoryGetter) => Partial<HistoryGetter>)) => void, get: () => HistoryGetter): PosHistorySlice => ({
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
    } else {
      logger.warn('POS', '[fetchParkedCarts] Error:', result.error);
    }
  },

  parkCart: async (tenantId, name, deliveryInfo?) => {
    const { cart, parkedCarts } = get();
    if (cart.length === 0) {
      const err = new AppErrorClass('SALE_NO_ITEMS', 'No hay productos en el carrito.');
      set({ error: err.message });
      return failure(err);
    }
    if (parkedCarts.length >= MAX_PARKED_CARTS) {
      const err = new AppErrorClass('PARKED_CART_MAX_REACHED', `Máximo ${MAX_PARKED_CARTS} ventas en cola. Completa o elimina una.`);
      set({ error: err.message });
      return failure(err);
    }
    const result = await posService.parkCart(tenantId, name, cart, undefined, deliveryInfo);
    if (result.ok) {
      set({ cart: [], activeParkedCartId: null, error: null });
      get().fetchParkedCarts(tenantId);
      return result;
    }
    logger.error('POS', '[parkCart] Error:', result.error);
    set({ loading: false, error: result.error.message });
    return failure(result.error);
  },

  loadParkedCart: (parked) => {
    set({ cart: parked.cart, activeParkedCartId: parked.id, error: null });
  },

  deleteParkedCart: async (tenantId, id) => {
    const result = await posService.deleteParkedCart(tenantId, id);
    if (!result.ok) {
      logger.error('POS', '[deleteParkedCart] Error:', result.error);
      useToastStore.getState().addToast({ type: 'error', message: result.error?.message ?? 'Error al eliminar venta en cola' });
      return;
    }
    set((state: HistoryGetter) => ({
      parkedCarts: state.parkedCarts.filter((p: ParkedCart) => p.id !== id),
      ...(state.activeParkedCartId === id ? { cart: [], activeParkedCartId: null } : {}),
    }));
  },

  loadLowStockAlert: async (tenantId) => {
    const result = await inventoryService.getLowStockProducts(tenantId);
    if (result.ok) {
      set({ lowStockAlert: result.data });
    } else {
      logger.warn('POS', '[loadLowStockAlert] Error:', result.error);
    }
  },
});
