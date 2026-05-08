import { MONEY_DECIMALS } from './constants';

/** Redondea a precisión monetaria (2 decimales). */
export function preciseRound(value: number, decimals: number = MONEY_DECIMALS): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** Formatea un número como moneda Bs. */
export function formatCurrency(
  amount: number,
  currency: 'VES' | 'USD' = 'VES',
): string {
  const prefix = currency === 'USD' ? '$ ' : 'Bs. ';
  return `${prefix}${amount.toFixed(MONEY_DECIMALS).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** Valida que un slug tenga el formato correcto: solo minúsculas, números y guiones. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}