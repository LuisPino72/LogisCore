import { type Result, success, failure, AppError } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { getDb, isDbReady } from '../../../services/dexie/db';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { ExchangeRateErrors } from '../../../specs/exchange-rate/errors';
import { ExchangeRateInputSchema } from '../../../specs/exchange-rate/index';
import { TenantTranslator } from '../../../services/tenantTranslator';
import type { ExchangeRateResponse } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/fetch-bcv-rate`;

const MANUAL_COOLDOWN_MS = 30_000; // 30 segundos entre cambios manuales
let lastManualUpdateAt = 0;

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
    if (!navigator.onLine) {
      const cached = await readFromDexie(tenantId);
      if (cached) return success(cached);
      return success(null);
    }

    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

    const { data, error } = await supabase
      .from('exchange_rates')
      .select('id, rate, source, fetched_at, created_at')
      .eq('tenant_id', tenantUuid)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      const cached = await readFromDexie(tenantId);
      if (cached) return success(cached);
      return failure(new AppError(ExchangeRateErrors.EXCHANGE_RATE_API_FAILED, 'Error al cargar tasa BCV'));
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
          ExchangeRateErrors.EXCHANGE_RATE_API_FAILED,
          (body as { message?: string }).message ?? 'Error al consultar API del BCV',
        ));
      }

      const data: ExchangeRateResponse = await response.json();
      await cacheToDexie(data, tenantId);
      return success(data);
    } catch (err) {
      logger.error('Exchange', 'Error en triggerBcvFetch:', err);
      return failure(new AppError(ExchangeRateErrors.EXCHANGE_RATE_API_FAILED, 'Error de conexión al consultar BCV'));
    }
  },

  async setManualRate(tenantId: string, rate: number): Promise<Result<ExchangeRateResponse, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    // Rate limiting: 30 segundos entre cambios manuales
    const now = Date.now();
    if (now - lastManualUpdateAt < MANUAL_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((MANUAL_COOLDOWN_MS - (now - lastManualUpdateAt)) / 1000);
      return failure(new AppError(ExchangeRateErrors.EXCHANGE_RATE_INVALID,
        `Espera ${secondsLeft} segundos antes de cambiar la tasa manual`));
    }

    // Validación con Zod schema (rango 10-200, 2 decimales)
    const parsed = ExchangeRateInputSchema.safeParse({ rate });
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Tasa inválida';
      return failure(new AppError(ExchangeRateErrors.EXCHANGE_RATE_INVALID, msg));
    }

    const validatedRate = parsed.data.rate;
    lastManualUpdateAt = now;

    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

    const { data, error } = await supabase
      .from('exchange_rates')
      .upsert(
        {
          tenant_id: tenantUuid,
          rate: validatedRate,
          source: 'manual',
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id', ignoreDuplicates: false },
      )
      .select('id, rate, source, fetched_at, created_at')
      .single();

    if (error) {
      return failure(new AppError(ExchangeRateErrors.EXCHANGE_RATE_API_FAILED, 'Error al guardar tasa manual'));
    }

    if (data) {
      await cacheToDexie(data, tenantId);
    }

    return success(data);
  },
};
