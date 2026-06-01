import { useEffect, useCallback } from 'react';
import { EventBus } from '@logiscore/core';
import { useGastosStore } from '../stores/gastosStore';
import { gastosService } from '../services/gastosService';
import { useNotificationStore } from '../../../stores/notificationStore';

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
    const result = await gastosService.checkAndGenerateRecurring(tenantId);
    if (result.ok && result.data.upcoming.length > 0) {
      const store = useNotificationStore.getState();
      store.setTenantId(tenantId);
      for (const tpl of result.data.upcoming) {
        await store.addNotification({
          type: 'recurring_expense_reminder',
          title: 'Gasto recurrente próximo',
          message: `${tpl.category} - ${tpl.description || 'Sin descripción'} vence mañana`,
          actionLabel: 'Cancelar ocurrencia',
          actionPayload: { expenseId: tpl.id, date: tpl.date },
        });
      }
    }
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
