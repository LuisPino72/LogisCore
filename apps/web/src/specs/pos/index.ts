import { z } from 'zod';

/** POS Spec - POS-001..011 */

export const PAYMENT_METHODS = ['efectivo_bs', 'pago_movil', 'tarjeta_bs', 'efectivo_usd'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];
export const IGTF_RATE = 0.03;

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
  createdAt: z.string().datetime(),
});

export type SaleItem = z.infer<typeof SaleItemSchema>;

export const CashRegisterSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  isOpen: z.boolean(),
  openedBy: z.string().uuid().nullable(),
  openedAt: z.string().datetime().nullable(),
  openingBalanceBs: z.number().min(0).nullable(),
  closedBy: z.string().uuid().nullable(),
  closedAt: z.string().datetime().nullable(),
  closingBalanceBs: z.number().nullable(),
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
});

export type CreateSaleInput = z.infer<typeof CreateSaleInputSchema>;

export const OpenCashRegisterInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
  openingBalanceBs: z.number().positive('Monto inicial debe ser mayor a 0'),
});

export type OpenCashRegisterInput = z.infer<typeof OpenCashRegisterInputSchema>;

export const CloseCashRegisterInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
  declaredClosingBalanceBs: z.number().min(0, 'Monto final declarado requerido'),
});

export type CloseCashRegisterInput = z.infer<typeof CloseCashRegisterInputSchema>;
