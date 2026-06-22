import { useEffect, useState, useCallback, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { settingsService } from '../services/settingsService';
import { useAuthStore } from '../../auth/stores/authStore';
import type { FiscalSettings, OperationSettings } from '../types';

export function useSettings() {
  const store = useSettingsStore();
  const tenantId = useAuthStore((s) => s.session?.tenantId);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!tenantId) return;
    // Reset ref when tenant changes to allow re-loading
    if (loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    settingsService.loadTenantSettings(tenantId).then((r) => {
      if (cancelled) return;
      if (!r.ok) setError(r.error.message);
    });
    return () => { cancelled = true; };
  }, [tenantId]);

  const updateFiscal = useCallback(async (data: FiscalSettings) => {
    if (!tenantId) return;
    const session = useAuthStore.getState().session;
    if (!session?.userId) return;
    setError(null);
    const result = await settingsService.updateFiscalSettings(tenantId, session.userId, data);
    if (result.ok) {
      useSettingsStore.getState().setFiscalSettings(result.data);
    } else {
      setError(result.error.message);
    }
  }, [tenantId]);

  const updateOperations = useCallback(async (data: OperationSettings) => {
    if (!tenantId) return;
    const session = useAuthStore.getState().session;
    if (!session?.userId) return;
    setError(null);
    const result = await settingsService.updateOperationSettings(tenantId, session.userId, data);
    if (result.ok) {
      useSettingsStore.getState().setOperationSettings(result.data);
    } else {
      setError(result.error.message);
    }
  }, [tenantId]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setError(null);
    useSettingsStore.getState().setLoaded(false);
    const result = await settingsService.loadTenantSettings(tenantId);
    if (!result.ok) setError(result.error.message);
  }, [tenantId]);

  return {
    fiscalSettings: {
      ivaRate: store.ivaRate,
      igtfRate: store.igtfRate,
      igtfEnabled: store.igtfEnabled,
    },
    operationSettings: {
      maxDiscountPct: store.maxDiscountPct,
      defaultMinStock: store.defaultMinStock,
      defaultCreditLimit: store.defaultCreditLimit,
      mandatoryCustomerId: store.mandatoryCustomerId,
      lowStockThreshold: store.lowStockThreshold,
      ticketFooterMessage: store.ticketFooterMessage,
    },
    loading: store.loading,
    loaded: store.loaded,
    error,
    updateFiscal,
    updateOperations,
    refresh,
  };
}
