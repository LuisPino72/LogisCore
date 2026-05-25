import { useEffect, useCallback } from 'react';
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

  return {
    recurringTemplates,
    fetchTemplates,
    checkAndGenerate,
  };
}
