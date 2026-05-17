import { type Result, success, failure, AppError } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { DashboardErrors } from '../../../specs/dashboard/errors';
import type { ExchangeRateResponse } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/fetch-bcv-rate`;

async function getAuthToken(): Promise<Result<string, AppError>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return failure(new AppError('AUTH_NO_SESSION', 'No hay sesión activa'));
  }
  return success(session.access_token);
}

export const exchangeRateService = {
  async fetchLatest(tenantId: string): Promise<Result<ExchangeRateResponse | null, AppError>> {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('id, rate, source, fetched_at, created_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return failure(new AppError(DashboardErrors.TASA_BCV_FETCH_FAILED, 'Error al cargar tasa BCV'));
    }

    return success(data);
  },

  async triggerBcvFetch(tenantId: string): Promise<Result<ExchangeRateResponse, AppError>> {
    const tokenResult = await getAuthToken();
    if (!tokenResult.ok) return tokenResult;

    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenResult.data}`,
        },
        body: JSON.stringify({ tenant_id: tenantId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return failure(new AppError(
          DashboardErrors.TASA_API_ERROR,
          (body as { message?: string }).message ?? 'Error al consultar API del BCV',
        ));
      }

      const data: ExchangeRateResponse = await response.json();
      return success(data);
    } catch (err) {
      logger.error('Exchange', 'Error en triggerBcvFetch:', err);
      return failure(new AppError(DashboardErrors.TASA_API_ERROR, 'Error de conexión al consultar BCV'));
    }
  },

  async setManualRate(tenantId: string, rate: number): Promise<Result<ExchangeRateResponse, AppError>> {
    if (!rate || rate <= 0) {
      return failure(new AppError(DashboardErrors.TASA_INVALID_RATE, 'La tasa debe ser mayor a 0'));
    }

    const { data, error } = await supabase
      .from('exchange_rates')
      .upsert(
        {
          tenant_id: tenantId,
          rate,
          source: 'manual',
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id', ignoreDuplicates: false },
      )
      .select('id, rate, source, fetched_at, created_at')
      .single();

    if (error) {
      return failure(new AppError(DashboardErrors.TASA_BCV_FETCH_FAILED, 'Error al guardar tasa manual'));
    }

    return success(data);
  },
};
