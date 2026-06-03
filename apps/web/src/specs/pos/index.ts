import { z } from 'zod';

/** POS Spec - POS-001..011 */

export const PAYMENT_METHODS = ['efectivo_bs', 'pago_movil', 'tarjeta_bs', 'efectivo_usd'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];
// AUDIT-FLOW-2-002: IGTF_RATE ahora proviene SOLO de @logiscore/shared (Regla de Oro #8).
// Eliminado duplicado 0.03 (incorrecto, el canónico está en 0 según motor fiscal VE vigente).
export { IGTF_RATE } from '@logiscore/shared';

export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);

export const CartItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().positive('Cantidad debe ser mayor a 0'),
  unitPriceUsd: z.number().positive(),
  totalPriceUsd: z.number().positive(),
  isWeighted: z.boolean(),
  isTaxable: z.boolean().default(true),
  unit: z.string(),
  stock: z.number().int().min(0),
  presentationId: z.string().uuid().optional(),
  presentationName: z.string().optional(),
  unitMultiplier: z.number().positive().default(1),
  stockType: z.literal('shared').optional(),
});

export type CartItem = z.infer<typeof CartItemSchema>;

export const SaleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  userId: z.string().uuid(),
  paymentMethod: PaymentMethodSchema,
  subtotalBs: z.number().positive(),
  igtfBs: z.number().min(0),
  ivaBs: z.number().min(0),
  totalBs: z.number().positive(),
  exchangeRate: z.number().positive(),
  status: z.enum(['completed', 'voided']),
  voidedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().min(0).optional(),
  discountBs: z.number().min(0).optional(),
  customerId: z.string().uuid().optional(),
});

export type Sale = z.infer<typeof SaleSchema>;

export const SaleItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  saleId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string().min(1),
  productSku: z.string().min(1),
  quantity: z.number().positive(),
  unitPriceUsd: z.number().positive(),
  totalPriceUsd: z.number().positive(),
  costUsdPerUnit: z.number().min(0).optional(),
  isWeighted: z.boolean(),
  unit: z.string(),
  presentationId: z.string().uuid().optional(),
  presentationName: z.string().optional(),
  unitMultiplier: z.number().positive().default(1),
  stockType: z.literal('shared').optional(),
  createdAt: z.string().datetime(),
  // AUDIT-012: FIFO restore (track original lot consumption for void)
  consumedLots: z.array(z.object({ lotId: z.string(), quantity: z.number().positive() })).optional(),
});

export type SaleItem = z.infer<typeof SaleItemSchema>;

export const CashRegisterSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  isOpen: z.boolean(),
  openedBy: z.string().uuid().nullable(),
  openedAt: z.string().datetime().nullable(),
  openingBalanceBs: z.number().min(0).nullable(),
  openingRate: z.number().positive().nullable(),
  closedBy: z.string().uuid().nullable(),
  closedAt: z.string().datetime().nullable(),
  closingBalanceBs: z.number().nullable(),
  closingRate: z.number().positive().nullable(),
  expectedClosingBs: z.number().nullable(),
  differenceBs: z.number().nullable(),
  totalSalesCount: z.number().int().min(0),
  totalSalesBs: z.number().min(0),
  totalIgtfBs: z.number().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type CashRegister = z.infer<typeof CashRegisterSchema>;

export const CreateSaleInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
  paymentMethod: PaymentMethodSchema,
  items: z.array(CartItemSchema).min(1, 'Debe haber al menos un producto'),
  exchangeRate: z.number().positive('Se requiere tasa de cambio'),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().min(0).optional(),
  customerId: z.string().uuid().optional(),
  allowOverride: z.boolean().optional(),
});

export type CreateSaleInput = z.infer<typeof CreateSaleInputSchema>;

export const OpenCashRegisterInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
  openingBalanceBs: z.number().positive('Monto inicial debe ser mayor a 0'),
  openingRate: z.number().positive('Se requiere tasa de cambio al abrir la caja'),
});

export type OpenCashRegisterInput = z.infer<typeof OpenCashRegisterInputSchema>;

export const CloseCashRegisterInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
  declaredClosingBalanceBs: z.number().min(0, 'Monto final declarado requerido'),
  closingRate: z.number().positive('Se requiere tasa de cambio al cerrar la caja'),
});

export type CloseCashRegisterInput = z.infer<typeof CloseCashRegisterInputSchema>;

// ===== Payment Metadata =====

export const METADATA_PAGOS = {
  efectivo_bs: { label: 'Efectivo', moneda: 'Bs', requiereVuelto: true, aplicaIgtf: false },
  pago_movil: { label: 'P Móvil', moneda: 'Bs', requiereVuelto: false, aplicaIgtf: false },
  tarjeta_bs: { label: 'Tarjeta', moneda: 'Bs', requiereVuelto: false, aplicaIgtf: false },
  efectivo_usd: { label: 'Efectivo $', moneda: 'USD', requiereVuelto: true, aplicaIgtf: true },
} as const;

export { calculateSaleTotals } from './utils';
export type { SaleTotals } from './utils';
