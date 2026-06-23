import { posService } from '../services/posService';
import { useExchangeRateStore } from '../../../features/exchange/stores/exchangeRateStore';
import { type Result, type AppError, success, failure, AppError as AppErrorClass } from '@logiscore/core';
import type { CashRegister } from '../types';

export interface PosRegisterSlice {
  cashRegister: CashRegister | null;
  activeRegisterId: string | null;
  activeSessionId: string | null;
  registerName: string | null;
  loading: boolean;
  error: string | null;
  fetchCashRegister: (tenantId: string, silent?: boolean) => Promise<void>;
  setActiveRegister: (registerId: string, sessionId: string, name: string) => void;
  clearActiveRegister: () => void;
  openCashRegister: (tenantId: string, openingBalance: number, userId: string, registerId?: string, registerName?: string) => Promise<Result<CashRegister, AppError>>;
  closeCashRegister: (tenantId: string, declaredClosingBalance: number, userId: string) => Promise<Result<CashRegister, AppError>>;
}

export const initialRegisterState = {
  cashRegister: null as CashRegister | null,
  activeRegisterId: null as string | null,
  activeSessionId: null as string | null,
  registerName: null as string | null,
  loading: false,
  error: null as string | null,
};

type RegisterGetter = PosRegisterSlice;

export const createRegisterSlice = (set: any, get: () => RegisterGetter): PosRegisterSlice => ({
  ...initialRegisterState,

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
});
