import { z } from 'zod';

/** Exchange Rate Spec - EXCH-001..004 */

// =====================
// Schemas Zod
// =====================

export const ExchangeRateSchema = z.object({
  id: z.string().uuid(),
  rate: z.number().positive().max(999999.9999).describe('Tasa BCV en Bs por USD'),
  source: z.enum(['api', 'manual', 'fallback']),
  fetchedAt: z.string().datetime(),
  createdBy: z.string().uuid().optional(),
});

export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;

export const ExchangeRateInputSchema = z.object({
  rate: z.number().positive('La tasa debe ser mayor a 0').max(999999.99),
});

export type ExchangeRateInput = z.infer<typeof ExchangeRateInputSchema>;

// =====================
// Constantes
// =====================

export const EXCHANGE_RATE_CONFIG = {
  API_URL: 'https://ve.dolarapi.com/v1/dolares/oficial',
  CACHE_TTL_MS: 3600000, // 1 hora
  CRON_SCHEDULE: '0 6 * * *', // 12:01 AM VET = 6:01 UTC
  DEFAULT_FALLBACK: undefined,
} as const;

// =====================
// Tipos utilitarios
// =====================

export type ExchangeRateSource = 'api' | 'manual' | 'fallback';

// =====================
// Helper functions
// =====================

export function validateExchangeRateInput(input: unknown): ExchangeRateInput {
  return ExchangeRateInputSchema.parse(input);
}

export function isValidRate(rate: unknown): rate is number {
  return typeof rate === 'number' && rate > 0 && rate < 999999.99;
}