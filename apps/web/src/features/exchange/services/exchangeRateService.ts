import { type Result, success, failure, AppError } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { getDb, isDbReady } from '../../../services/dexie/db';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
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

async function cacheToDexie(rate: ExchangeRateResponse, tenantId: string): Promise<void> {
  if (!isDbReady()) return;
  try {
    const db = getDb();
    await db.exchangeRates.put({
      id: rate.id,
      tenantId,
      rate: rate.rate,
      source: rate.source,
      fetchedAt: rate.fetched_at,
      createdAt: rate.created_at,
    });
  } catch (err) {
    logger.warn('Exchange', 'Error caching rate to Dexie:', err);
  }
}

async function readFromDexie(tenantId: string): Promise<ExchangeRateResponse | null> {
  if (!isDbReady()) return null;
  try {
    const db = getDb();
    const cached = await db.exchangeRates
      .where('tenantId')
      .equals(tenantId)
      .reverse()
      .sortBy('createdAt');

    if (cached.length > 0) {
      return {
        id: cached[0].id,
        rate: cached[0].rate,
        source: cached[0].source,
        fetched_at: cached[0].fetchedAt,
        created_at: cached[0].createdAt,
      };
    }
  } catch (err) {
    logger.warn('Exchange', 'Error reading Dexie cache:', err);
  }
  return null;
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
      if (!navigator.onLine) {
        const cached = await readFromDexie(tenantId);
        if (cached) return success(cached);
      }
      return failure(new AppError(DashboardErrors.TASA_BCV_FETCH_FAILED, 'Error al cargar tasa BCV'));
    }

    if (data) {
      await cacheToDexie(data, tenantId);
    }

    return success(data);
  },

  async triggerBcvFetch(tenantId: string): Promise<Result<ExchangeRateResponse, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

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
      await cacheToDexie(data, tenantId);
      return success(data);
    } catch (err) {
      logger.error('Exchange', 'Error en triggerBcvFetch:', err);
      return failure(new AppError(DashboardErrors.TASA_API_ERROR, 'Error de conexión al consultar BCV'));
    }
  },

  async setManualRate(tenantId: string, rate: number): Promise<Result<ExchangeRateResponse, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

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

    if (data) {
      await cacheToDexie(data, tenantId);
    }

    return success(data);
  },
};
