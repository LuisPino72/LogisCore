import { useCallback, useEffect } from 'react';
import { type Result, failure, AppError } from '@logiscore/core';
import { useGastosStore } from '../stores/gastosStore';
import { gastosService } from '../services/gastosService';
import type { Gasto, CreateGastoInput, UpdateGastoInput } from '../types';

export function useGastos(tenantId: string | null) {
  const {
    gastos, loading, filters, setGastos, setLoading, setFilters,
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

  const createGasto = useCallback(async (input: CreateGastoInput): Promise<Result<Gasto, AppError>> => {
    if (!tenantId) return failure(new AppError('NO_TENANT', 'No hay tenant activo.'));
    const result = await gastosService.create(tenantId, 'system', input);
    if (result.ok) {
      await fetchGastos();
    }
    return result;
  }, [tenantId, fetchGastos]);

  const updateGasto = useCallback(async (id: string, input: UpdateGastoInput): Promise<Result<Gasto, AppError>> => {
    if (!tenantId) return failure(new AppError('NO_TENANT', 'No hay tenant activo.'));
    const result = await gastosService.update(tenantId, id, input);
    if (result.ok) {
      await fetchGastos();
    }
    return result;
  }, [tenantId, fetchGastos]);

  const removeGasto = useCallback(async (id: string): Promise<Result<void, AppError>> => {
    if (!tenantId) return failure(new AppError('NO_TENANT', 'No hay tenant activo.'));
    const result = await gastosService.remove(tenantId, id);
    if (result.ok) {
      await fetchGastos();
    }
    return result;
  }, [tenantId, fetchGastos]);

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
