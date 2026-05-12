import { z } from 'zod';

/** Sales Spec - SALE-001..008 */

export const PAYMENT_METHODS = ['efectivo_bs', 'pago_movil', 'tarjeta_bs', 'tarjeta_usd'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const IGTF_RATE = 0.03;

export const BoxStatusSchema = z.enum(['open', 'closed']);
export type BoxStatus = z.infer<typeof BoxStatusSchema>;

export const CashBoxSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  initialAmount: z.number().min(0),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().optional(),
  status: BoxStatusSchema,
});

export type CashBox = z.infer<typeof CashBoxSchema>;

export const CartItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  quantity: z.number().positive(),
  priceUsd: z.number().positive(),
  priceBs: z.number().positive(),
  subtotalUsd: z.number(),
  subtotalBs: z.number(),
  isWeighted: z.boolean(),
});

export type CartItem = z.infer<typeof CartItemSchema>;

export const SaleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  items: z.array(CartItemSchema),
  totalUsd: z.number().positive(),
  totalBs: z.number().positive(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  amountPaid: z.number().positive(),
  change: z.number().min(0),
  igtf: z.number().min(0),
  exchangeRate: z.number().positive(),
  createdAt: z.string().datetime(),
});

export type Sale = z.infer<typeof SaleSchema>;

export const METADATA_PAGOS = {
  efectivo_bs: { label: 'Efectivo Bs', moneda: 'Bs', requiereVuelto: true, aplicaIgtf: false },
  pago_movil: { label: 'Pago Móvil', moneda: 'Bs', requiereVuelto: false, aplicaIgtf: false },
  tarjeta_bs: { label: 'Tarjeta Bs', moneda: 'Bs', requiereVuelto: false, aplicaIgtf: false },
  tarjeta_usd: { label: 'Tarjeta USD', moneda: 'USD', requiereVuelto: false, aplicaIgtf: true },
} as const;