import { useEffect, useRef } from 'react';
import { useExchangeRateStore } from '../stores/exchangeRateStore';

const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 horas

export function useExchangeRate(tenantId: string | null) {
  const rate = useExchangeRateStore((s) => s.rate);
  const source = useExchangeRateStore((s) => s.source);
  const fetchedAt = useExchangeRateStore((s) => s.fetchedAt);
  const loading = useExchangeRateStore((s) => s.loading);
  const isUpdating = useExchangeRateStore((s) => s.isUpdating);
  const error = useExchangeRateStore((s) => s.error);
  const fetchLatest = useExchangeRateStore((s) => s.fetchLatest);
  const updateFromBcv = useExchangeRateStore((s) => s.updateFromBcv);
  const setManual = useExchangeRateStore((s) => s.setManual);
  const initialFetchDone = useRef(false);

  useEffect(() => {
    if (!tenantId) return;

    if (!initialFetchDone.current) {
      initialFetchDone.current = true;

      fetchLatest(tenantId).then(() => {
        const state = useExchangeRateStore.getState();

        if (!state.rate || !state.fetchedAt) {
          updateFromBcv(tenantId);
        } else {
          const lastFetch = new Date(state.fetchedAt).getTime();
          const isStale = Date.now() - lastFetch > STALE_THRESHOLD_MS;

          if (isStale && state.source !== 'manual') {
            updateFromBcv(tenantId);
          }
        }
      });
    }
  }, [tenantId]);

  return { rate, source, fetchedAt, loading, isUpdating, error, fetchLatest, updateFromBcv, setManual };
}
