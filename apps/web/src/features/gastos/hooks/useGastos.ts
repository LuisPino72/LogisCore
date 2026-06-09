import { useCallback, useEffect } from 'react';
import { type Result, failure, AppError, EventBus } from '@logiscore/core';
import { useGastosStore } from '../stores/gastosStore';
import { gastosService } from '../services/gastosService';
import { useAuthStore } from '../../auth/stores/authStore';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import type { Gasto, CreateGastoInput, UpdateGastoInput } from '../types';

export function useGastos(tenantId: string | null) {
  const {
    gastos, loading, filters, setGastos, setLoading, setFilters, setRecurringTemplates,
  } = useGastosStore();

  const fetchGastos = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const month = filters.month;
    let startDate: string | undefined;
    let endDate: string | undefined;
    if (month) {
      startDate = `${month}-01`;
      const d = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0);
      endDate = d.toISOString().slice(0, 10);
    }
    const result = await gastosService.getAll(tenantId, {
      status: filters.status !== 'all' ? filters.status : undefined,
      category: filters.category !== 'all' ? filters.category : undefined,
      startDate,
      endDate,
    });
    if (result.ok) {
      setGastos(result.data);
    }
    setLoading(false);
  }, [tenantId, filters.month, filters.status, filters.category, setGastos, setLoading]);

  useEffect(() => {
    fetchGastos();
  }, [fetchGastos]);

  useEffect(() => {
    if (!tenantId) return;
    const sub = EventBus.on('SYNC.REFRESH_TABLE', (payload: unknown) => {
      const { table } = payload as { table?: string };
      if (table === 'expenses' || table === '*') {
        fetchGastos();
      }
    });
    return () => { EventBus.off(sub); };
  }, [tenantId, fetchGastos]);

  const createGasto = useCallback(async (input: CreateGastoInput): Promise<Result<Gasto, AppError>> => {
    if (!tenantId) return failure(new AppError('NO_TENANT', 'No hay negocio activo.'));
    // PLAN-113 (M1): sin sesion real no creamos gastos atribuidos a usuario fantasma
    const userId = useAuthStore.getState().session?.userId;
    if (!userId) return failure(new AppError('AUTH_REQUIRED', 'Sin sesion activa. Inicia sesion para crear gastos.'));
    const result = await gastosService.create(tenantId, userId, input);
    if (result.ok) {
      await fetchGastos();
      if (input.isRecurring) {
        const templatesResult = await gastosService.getRecurringTemplates(tenantId);
        if (templatesResult.ok) {
          setRecurringTemplates(templatesResult.data);
        }
      }
    }
    return result;
  }, [tenantId, fetchGastos, setRecurringTemplates]);

  const updateGasto = useCallback(async (id: string, input: UpdateGastoInput): Promise<Result<Gasto, AppError>> => {
    if (!tenantId) return failure(new AppError('NO_TENANT', 'No hay negocio activo.'));
    const isPayingPending = input.status === 'paid';
    const currentRate = isPayingPending ? useExchangeRateStore.getState().rate ?? undefined : undefined;
    const result = await gastosService.update(tenantId, id, input, currentRate);
    if (result.ok) {
      await fetchGastos();
      const templatesResult = await gastosService.getRecurringTemplates(tenantId);
      if (templatesResult.ok) {
        setRecurringTemplates(templatesResult.data);
      }
    }
    return result;
  }, [tenantId, fetchGastos, setRecurringTemplates]);

  const removeGasto = useCallback(async (id: string): Promise<Result<void, AppError>> => {
    if (!tenantId) return failure(new AppError('NO_TENANT', 'No hay negocio activo.'));
    const result = await gastosService.remove(tenantId, id);
    if (result.ok) {
      await fetchGastos();
      const templatesResult = await gastosService.getRecurringTemplates(tenantId);
      if (templatesResult.ok) {
        setRecurringTemplates(templatesResult.data);
      }
    }
    return result;
  }, [tenantId, fetchGastos, setRecurringTemplates]);

  return {
    gastos,
    loading,
    filters,
    setFilters,
    fetchGastos,
    createGasto,
    updateGasto,
    removeGasto,
  };
}
