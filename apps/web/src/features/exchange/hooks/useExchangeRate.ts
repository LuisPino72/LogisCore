import { useEffect, useRef } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useExchangeRateStore } from '../stores/exchangeRateStore';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 horas — BCV actualiza 1x/día (lun-vie)
const STALE_CRITICAL_MS = 48 * 60 * 60 * 1000; // 48 horas — dos días sin actualizar

// Closure a nivel de módulo para dedup de alertas (sobrevive re-mounts)
let lastEmittedStaleLevel = 0;

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
          // No hay tasa en cache → fetch del BCV
          updateFromBcv(tenantId);
        } else {
          const lastFetch = new Date(state.fetchedAt).getTime();
          const ageMs = Date.now() - lastFetch;
          const isStale = ageMs > STALE_THRESHOLD_MS;

          if (isStale && state.source !== 'manual') {
            updateFromBcv(tenantId);
          } else {
            emitStaleAlertIfChanged(state, ageMs, tenantId);
          }
        }
      });
    }
  }, [tenantId]);

  // Detectar errores y emitir alerta
  useEffect(() => {
    if (!tenantId || !error) return;
    if (rate !== null) return; // Hay rate en cache, no es crítico
    EventBus.emit(SystemEvents.EXCHANGE_RATE_FAILED, { tenantId, error });
  }, [error, rate, tenantId]);

  return { rate, source, fetchedAt, loading, isUpdating, error, fetchLatest, updateFromBcv, setManual };
}

function emitStaleAlertIfChanged(
  state: { rate: number | null; source: string | null; fetchedAt: string | null },
  ageMs: number,
  tenantId: string,
): void {
  let level: 0 | 1 | 2 = 0;
  if (ageMs > STALE_CRITICAL_MS) level = 2;
  else if (ageMs > STALE_THRESHOLD_MS) level = 1;

  // Solo emitir si el nivel escaló (no spammear en cada re-render)
  if (level === 0 || level <= lastEmittedStaleLevel) {
    lastEmittedStaleLevel = level;
    return;
  }
  lastEmittedStaleLevel = level;

  const hours = Math.round(ageMs / (60 * 60 * 1000));
  EventBus.emit(SystemEvents.EXCHANGE_RATE_STALE, {
    tenantId,
    hours,
    level,
    source: state.source,
  });
}

