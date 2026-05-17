/** Constantes fiscales del Motor Fiscal Venezolano (Regla de Oro #8). */

/** Tasa IGTF: 3% sobre pagos en divisas (USD). */
export const IGTF_RATE = 0;

/** Patrón de validación RIF venezolano: 1 letra (V,J,E,G,P) + 9 dígitos. */
export const RIF_PATTERN = /^[VJEGP]\d{9}$/;

/** Diferencia máxima permitida en céntimos (Regla de Oro #8). */
export const MAX_CENTS_DIFFERENCE = 0.01;

/** Tasa IVA: 16% sobre productos gravables. */
export const IVA_RATE = 0.16;

/** Precisión decimal para dinero (NUMERIC(19,2) en Postgres). */
export const MONEY_DECIMALS = 2;

/** Precisión para productos pesables. */
export const WEIGHT_DECIMALS = 2;

/** Unidades de medida pesables. */
export const WEIGHTED_UNITS = ['kg', 'gr', 'lt', 'm'] as const;

/** Unidades de medida no pesables (legacy: 'un'). */
export const NON_WEIGHTED_UNITS = ['unidad', 'un'] as const;

/** Tipos de moneda aceptados. */
export const CURRENCY_TYPES = ['VES', 'USD'] as const;
export type CurrencyType = (typeof CURRENCY_TYPES)[number];

/** Métodos de pago (POS). */
export const PAYMENT_METHODS = ['efectivo_bs', 'pago_movil', 'tarjeta_bs', 'efectivo_usd'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];