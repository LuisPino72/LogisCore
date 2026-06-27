import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createCartSlice, initialCartState } from './posCartStore';
import type { PosCartSlice } from './posCartStore';
import { createRegisterSlice, initialRegisterState } from './posRegisterStore';
import type { PosRegisterSlice } from './posRegisterStore';
import { createCatalogSlice, initialCatalogState } from './posCatalogStore';
import type { PosCatalogSlice } from './posCatalogStore';
import { createCustomerSlice, initialCustomerState } from './posCustomerStore';
import type { PosCustomerSlice } from './posCustomerStore';
import { createHistorySlice, initialHistoryState } from './posHistoryStore';
import type { PosHistorySlice } from './posHistoryStore';
import { posService } from '../services/posService';
import { useExchangeRateStore } from '../../../features/exchange/stores/exchangeRateStore';
import { type Result, type AppError, success, failure, AppError as AppErrorClass } from '@logiscore/core';
import type { PaymentMethod } from '../types';
import type { CreateSaleInput } from '../../../specs/pos';
import { MAX_PARKED_CARTS } from '../../../specs/pos';
interface PosStore extends PosCartSlice, PosRegisterSlice, PosCatalogSlice, PosCustomerSlice, PosHistorySlice {
  completeSale: (tenantId: string, paymentMethod: PaymentMethod, userId: string) => Promise<Result<string, AppError>>;
  voidSale: (saleId: string, tenantId: string, userId: string) => Promise<Result<void, AppError>>;
  getTodaySoldProducts: (tenantId: string, maxProducts?: number, referenceDate?: Date) => Promise<Result<Array<{ productId: string; productName: string; productSku: string; quantity: number }>, AppError>>;
  reset: () => void;
  showDeliveryPrompt: boolean;
  setShowDeliveryPrompt: (v: boolean) => void;
  parkAsDelivery: (tenantId: string, name: string, needsKitchen: boolean) => Promise<boolean>;
  parkNormal: (tenantId: string, name: string) => Promise<boolean>;
}

export const usePosStore = create<PosStore>()(
  persist(
    (set, get) => ({
      ...createCartSlice(set, get),
      ...createRegisterSlice(set, get),
      ...createCatalogSlice(set, get),
      ...createCustomerSlice(set, get),
      ...createHistorySlice(set, get),

      showDeliveryPrompt: false,
      setShowDeliveryPrompt: (v) => set({ showDeliveryPrompt: v }),

      parkAsDelivery: async (tenantId, name, needsKitchen) => {
        const { cart, parkedCarts } = get();
        if (cart.length === 0) {
          set({ error: 'No hay productos en el carrito.' });
          return false;
        }
        if (parkedCarts.length >= MAX_PARKED_CARTS) {
          set({ error: `Máximo ${MAX_PARKED_CARTS} ventas en cola. Completa o elimina una.` });
          return false;
        }
        const result = await posService.parkCart(tenantId, name, cart, get().selectedCustomerId ?? undefined, { orderType: 'delivery', needsKitchen });
        if (result.ok) {
          set({ cart: [], activeParkedCartId: null, error: null, showDeliveryPrompt: false });
          get().fetchParkedCarts(tenantId);
          return true;
        }
        set({ loading: false, error: result.error.message });
        return false;
      },

      parkNormal: async (tenantId, name) => {
        return get().parkCart(tenantId, name);
      },

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

      reset: () => set({
        ...initialCartState,
        ...initialRegisterState,
        ...initialCatalogState,
        ...initialCustomerState,
        ...initialHistoryState,
      }),
    }),
    {
      name: 'logiscore-pos-cart',
      storage: createJSONStorage(() => localStorage),
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
