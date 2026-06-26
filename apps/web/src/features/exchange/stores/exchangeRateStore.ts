import { create } from 'zustand';
import type { ExchangeRateState } from '../types';
import { exchangeRateService } from '../services/exchangeRateService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { EventBus, SystemEvents } from '@logiscore/core';

export interface ExchangeRateStore extends ExchangeRateState {
  fetchLatest: (tenantId: string) => Promise<void>;
  updateFromBcv: (tenantId: string) => Promise<void>;
  setManual: (tenantId: string, rate: number) => Promise<void>;
  reset: () => void;
}

const initialState: ExchangeRateState = {
  rate: null,
  source: null,
  fetchedAt: null,
  loading: false,
  isUpdating: false,
  error: null,
};

export const useExchangeRateStore = create<ExchangeRateStore>((set, get) => ({
  ...initialState,

  fetchLatest: async (tenantId: string) => {
    set({ loading: true, error: null });

    const result = await exchangeRateService.fetchLatest(tenantId);

    if (result.ok) {
      set({
        rate: result.data?.rate ?? null,
        source: result.data?.source ?? null,
        fetchedAt: result.data?.fetched_at ?? null,
        loading: false,
      });
      const newRate = result.data?.rate ?? null;
      if (newRate !== null) {
        EventBus.emit(SystemEvents.EXCHANGE_RATE_UPDATED, { tenantId, rate: newRate, source: result.data?.source ?? 'bcv' });
      }
    } else {
      set({ loading: false, error: result.error.message });
    }
  },

  updateFromBcv: async (tenantId: string) => {
    set({ isUpdating: true, error: null });

    const result = await exchangeRateService.triggerBcvFetch(tenantId);

    if (result.ok) {
      const prevRate = get().rate;
      set({
        rate: result.data.rate,
        source: result.data.source,
        fetchedAt: result.data.fetched_at ?? new Date().toISOString(),
        isUpdating: false,
      });
      if (result.data.rate !== prevRate) {
        EventBus.emit(SystemEvents.EXCHANGE_RATE_UPDATED, { tenantId, rate: result.data.rate, source: 'bcv' });
        logAuditEventOnly({
          eventName: SystemEvents.EXCHANGE_RATE_UPDATED,
          module: 'EXCHANGE',
          payload: { rate: result.data.rate, source: result.data.source },
          context: {},
        });
      }
    } else {
      set({ isUpdating: false, error: result.error.message });
    }
  },

  setManual: async (tenantId: string, rate: number) => {
    set({ isUpdating: true, error: null });

    const result = await exchangeRateService.setManualRate(tenantId, rate);

    if (result.ok) {
      const prevRate = get().rate;
      set({
        rate: result.data.rate,
        source: result.data.source,
        fetchedAt: result.data.fetched_at ?? new Date().toISOString(),
        isUpdating: false,
      });
      if (result.data.rate !== prevRate) {
        EventBus.emit(SystemEvents.EXCHANGE_RATE_UPDATED, { tenantId, rate: result.data.rate, source: 'manual' });
        logAuditEventOnly({
          eventName: SystemEvents.EXCHANGE_RATE_UPDATED,
          module: 'EXCHANGE',
          payload: { rate: result.data.rate, source: result.data.source },
          context: {},
        });
      }
    } else {
      set({ isUpdating: false, error: result.error.message });
    }
  },

  reset: () => set(initialState),
}));
