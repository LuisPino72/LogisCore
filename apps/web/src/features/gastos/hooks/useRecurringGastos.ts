import { useEffect, useCallback } from 'react';
import { EventBus } from '@logiscore/core';
import { useGastosStore } from '../stores/gastosStore';
import { gastosService } from '../services/gastosService';

export function useRecurringGastos(tenantId: string | null) {
  const { recurringTemplates, setRecurringTemplates } = useGastosStore();

  const fetchTemplates = useCallback(async () => {
    if (!tenantId) return;
    const result = await gastosService.getRecurringTemplates(tenantId);
    if (result.ok) {
      setRecurringTemplates(result.data);
    }
  }, [tenantId, setRecurringTemplates]);

  const checkAndGenerate = useCallback(async () => {
    if (!tenantId) return;
    await gastosService.checkAndGenerateRecurring(tenantId);
    await fetchTemplates();
  }, [tenantId, fetchTemplates]);

  useEffect(() => {
    if (tenantId) {
      fetchTemplates();
      checkAndGenerate();
    }
  }, [tenantId, fetchTemplates, checkAndGenerate]);

  useEffect(() => {
    if (!tenantId) return;
    const sub = EventBus.on('SYNC.REFRESH_TABLE', (payload: unknown) => {
      const { table } = payload as { table?: string };
      if (table === 'expenses' || table === '*') {
        fetchTemplates();
      }
    });
    return () => { EventBus.off(sub); };
  }, [tenantId, fetchTemplates]);

  return {
    recurringTemplates,
    fetchTemplates,
    checkAndGenerate,
  };
}
