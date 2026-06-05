import type { AppError } from '@logiscore/core';
import { failure, success, type Result } from '@logiscore/core';

/**
 * DINERO-003 (C3): Validadores de tasa de cambio.
 * Regla BCV: tasa de lunes a viernes se actualiza 1×/día;
 * sábado y domingo se mantiene la del viernes.
 * Una tasa con >7 días de antigüedad se considera "stale" (vencida).
 */

export interface ExchangeRateValidationError {
  code: 'EXCHANGE_RATE_REQUIRED' | 'EXCHANGE_RATE_STALE';
  message: string;
}

/**
 * requireExchangeRate: bloquea operaciones de compra cuando rate=0 o negativo.
 * Usado en createOrder y receiveOrder de purchaseService.
 */
export function requireExchangeRate(rate: number): Result<number, AppError> {
  if (!rate || rate <= 0 || !Number.isFinite(rate)) {
    return failure({
      code: 'EXCHANGE_RATE_REQUIRED',
      message: 'Se requiere una tasa de cambio válida (mayor a 0) para registrar la compra. Configure la tasa BCV del día antes de continuar.',
    } as unknown as AppError);
  }
  return success(rate);
}

/**
 * isRateStale: true si la tasa tiene >7 días (168 horas) de antigüedad.
 * Cubre el caso de lunes con tasa del viernes anterior.
 */
export function isRateStale(rateDate: Date, now: Date = new Date()): boolean {
  const hoursDiff = (now.getTime() - rateDate.getTime()) / (1000 * 60 * 60);
  return hoursDiff > 7 * 24;
}
