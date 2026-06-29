import { create } from 'zustand';
import type { FiscalSettings, OperationSettings } from '../types';

export interface SettingsStore {
  ivaRate: number;
  igtfRate: number;
  igtfEnabled: boolean;
  maxDiscountPct: number;
  defaultMinStock: number;
  defaultCreditLimit: number;
  mandatoryCustomerId: boolean;
  lowStockThreshold: number;
  ticketFooterMessage: string;
  needsKitchenDefault: boolean;
  defaultDeliveryFee: number;
  pagoMovilEnabled: boolean;
  pagoMovilBank: string;
  pagoMovilHolder: string;
  pagoMovilId: string;
  pagoMovilPhone: string;
  soundsEnabled: boolean;
  loading: boolean;
  loaded: boolean;
  setFiscalSettings: (data: FiscalSettings) => void;
  setOperationSettings: (data: OperationSettings) => void;
  setSoundsEnabled: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setLoaded: (v: boolean) => void;
  lastUpdatedAt: number;
  setLastUpdatedAt: (v: number) => void;
  reset: () => void;
}

const initialState = {
  ivaRate: 0.16,
  igtfRate: 0,
  igtfEnabled: false,
  maxDiscountPct: 100,
  defaultMinStock: 5,
  defaultCreditLimit: 100,
  mandatoryCustomerId: false,
  lowStockThreshold: 5,
  ticketFooterMessage: '¡Gracias por su compra!',
  needsKitchenDefault: false,
  defaultDeliveryFee: 0,
  pagoMovilEnabled: false,
  pagoMovilBank: '',
  pagoMovilHolder: '',
  pagoMovilId: '',
  pagoMovilPhone: '',
  soundsEnabled: true,
  loading: false,
  loaded: false,
  lastUpdatedAt: 0,
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...initialState,

  // L-18: El spread manual (vs Object.assign o spread de data) es INTENCIONAL.
  // Garantiza que solo se actualicen campos explícitos, evitando contaminación
  // desde objetos parciales que pudieran incluir props no deseadas.
  setFiscalSettings: (data: FiscalSettings) => {
    set({
      ivaRate: data.ivaRate,
      igtfRate: data.igtfRate,
      igtfEnabled: data.igtfEnabled,
    });
  },

  setOperationSettings: (data: OperationSettings) => {
    set({
      maxDiscountPct: data.maxDiscountPct,
      defaultMinStock: data.defaultMinStock,
      defaultCreditLimit: data.defaultCreditLimit,
      mandatoryCustomerId: data.mandatoryCustomerId,
      lowStockThreshold: data.lowStockThreshold,
      ticketFooterMessage: data.ticketFooterMessage,
      needsKitchenDefault: data.needsKitchenDefault ?? false,
      defaultDeliveryFee: data.defaultDeliveryFee ?? 0,
      pagoMovilEnabled: data.pagoMovilEnabled ?? false,
      pagoMovilBank: data.pagoMovilBank ?? '',
      pagoMovilHolder: data.pagoMovilHolder ?? '',
      pagoMovilId: data.pagoMovilId ?? '',
      pagoMovilPhone: data.pagoMovilPhone ?? '',
      soundsEnabled: data.soundsEnabled ?? true,
    });
  },

  setSoundsEnabled: (v: boolean) => set({ soundsEnabled: v }),

  setLoading: (v: boolean) => set({ loading: v }),

  setLoaded: (v: boolean) => set({ loaded: v }),

  setLastUpdatedAt: (v: number) => set({ lastUpdatedAt: v }),

  reset: () => {
    set({ ...initialState });
  },
}));
