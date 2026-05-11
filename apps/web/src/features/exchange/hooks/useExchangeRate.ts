import { useEffect, useRef } from 'react';
import { useExchangeRateStore } from '../stores/exchangeRateStore';

const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 horas

export function useExchangeRate(tenantId: string | null) {
  const store = useExchangeRateStore();
  const initialFetchDone = useRef(false);

  useEffect(() => {
    if (!tenantId) return;

    if (!initialFetchDone.current) {
      initialFetchDone.current = true;

      store.fetchLatest(tenantId).then(() => {
        const state = useExchangeRateStore.getState();

        if (!state.rate || !state.fetchedAt) {
          store.updateFromBcv(tenantId);
        } else {
          const lastFetch = new Date(state.fetchedAt).getTime();
          const isStale = Date.now() - lastFetch > STALE_THRESHOLD_MS;

          if (isStale && state.source !== 'manual') {
            store.updateFromBcv(tenantId);
          }
        }
      });
    }
  }, [tenantId]);

  return store;
}
