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

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/** Convierte claves camelCase a snake_case (recursivo). */
export function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const snake = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    result[snake] = isPlainObject(val) ? toSnake(val as Record<string, unknown>) : val;
  }
  return result;
}

/** Convierte claves snake_case a camelCase (recursivo). */
export function toCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = isPlainObject(val) ? toCamel(val as Record<string, unknown>) : val;
  }
  return result;
}

/** Genera un UUID v4. */
export function generateId(): string {
  return crypto.randomUUID();
}