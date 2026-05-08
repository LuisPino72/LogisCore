import { RIF_PATTERN, IGTF_RATE, MAX_CENTS_DIFFERENCE } from './constants';
import { preciseRound } from './utils';

export interface RifValidation {
  isValid: boolean;
  rif?: string;
  error?: 'MISSING_RIF' | 'RIF_INVALID';
}

/** FISCAL-001: Valida formato de RIF venezolano. */
export function validateRif(rif: string | null | undefined): RifValidation {
  if (!rif || rif.trim() === '') {
    return { isValid: false, error: 'MISSING_RIF' };
  }

  const cleanRif = rif.trim().toUpperCase();
  if (!RIF_PATTERN.test(cleanRif)) {
    return { isValid: false, rif: cleanRif, error: 'RIF_INVALID' };
  }

  return { isValid: true, rif: cleanRif };
}

/** FISCAL-002: Calcula el IGTF sobre monto en divisas. */
export function calculateIGTF(usdAmount: number, exchangeRate: number): number {
  const igtf = usdAmount * exchangeRate * IGTF_RATE;
  return preciseRound(igtf);
}

/** FISCAL-002: Valida que el IGTF almacenado coincida con el calculado. */
export function validateIGTF(storedIGTF: number, usdAmount: number, exchangeRate: number): boolean {
  const calculated = calculateIGTF(usdAmount, exchangeRate);
  return Math.abs(calculated - storedIGTF) <= MAX_CENTS_DIFFERENCE;
}

/** FISCAL-005: Aplica ajuste de céntimos si diff <= 0.01 Bs. */
export function applyCentsAdjustment(expected: number, actual: number): number {
  return Math.abs(expected - actual) <= MAX_CENTS_DIFFERENCE ? expected : actual;
}