import { z } from 'zod';
import { isoDateTime } from '../helpers';

/** POS Spec - POS-001..011 */

export const PAYMENT_METHODS = ['efectivo_bs', 'pago_movil', 'tarjeta_bs', 'efectivo_usd', 'credito'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const MAX_PARKED_CARTS = 10; // POS-002: shared between posService and posStore (m-21)
// AUDIT-FLOW-2-002: IGTF_RATE ahora proviene SOLO de @logiscore/shared (Regla de Oro #8).
// Eliminado duplicado 0.03 (incorrecto, el canónico está en 0 según motor fiscal VE vigente).
export { IGTF_RATE } from '@logiscore/shared';

export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);

export const CartItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().positive('Cantidad debe ser mayor a 0'),
  unitPriceUsd: z.number().positive('Precio unitario debe ser mayor a 0'),
  totalPriceUsd: z.number().positive('Precio total debe ser mayor a 0'),
  isWeighted: z.boolean(),
  isTaxable: z.boolean().default(true),
  unit: z.string(),
  stock: z.number().int().min(0),
  presentationId: z.string().uuid().optional(),
  presentationName: z.string().optional(),
  unitMultiplier: z.number().positive().default(1),
});

export type CartItem = z.infer<typeof CartItemSchema>;

export const SaleSchema = z.object({
  id: z.string().uuid(),
  // TODO-L-02: tenantId debería validarse como slug (formato: [a-z0-9-]{3,}) o UUID.
  // Validar en runtime requeriría conocer si la fuente es slug (URL) o UUID (DB).
  tenantId: z.string(),
  userId: z.string().uuid(),
  paymentMethod: PaymentMethodSchema,
  subtotalBs: z.number().positive(),
  igtfBs: z.number().min(0),
  ivaBs: z.number().min(0),
  totalBs: z.number().positive(),
  exchangeRate: z.number().positive(),
  status: z.enum(['completed', 'voided', 'pedida', 'preparacion', 'lista', 'pagada', 'despachada', 'entregada', 'cancelada']),
  voidedAt: isoDateTime.optional(),
  createdAt: isoDateTime,
  deletedAt: isoDateTime.optional(),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().min(0).optional(),
  discountBs: z.number().min(0).optional(),
  customerId: z.string().uuid().optional(),
  // POS-002 (C-6): montos en USD persistidos para auditoría cross-device
  // e históricos independientes de la tasa de cambio actual
  subtotalUsd: z.number().min(0),
  ivaUsd: z.number().min(0),
  igtfUsd: z.number().min(0),
  totalUsd: z.number().min(0),
  discountUsd: z.number().min(0).optional(),
  // Sistema de crédito (fiado)
  // MED-10: FK a cashRegister para voidSale preciso
  cashRegisterId: z.string().uuid().optional(),
  isCreditSale: z.boolean().default(false),
  creditCollected: z.boolean().default(false),
  collectedAt: isoDateTime.optional(),
  orderType: z.enum(['delivery']).optional(),
  needsKitchen: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  kitchenNotes: z.string().optional(),
  orderNumber: z.string().optional(),
  deliveryPersonName: z.string().optional(),
  deliveryFee: z.number().min(0).optional(),
  deliveryAddress: z.string().optional(),
  deliveryLat: z.number().optional(),
  deliveryLng: z.number().optional(),
  deliveryNotes: z.string().optional(),
  paidAt: isoDateTime.optional(),
  preparedAt: isoDateTime.optional(),
  dispatchedAt: isoDateTime.optional(),
  deliveredAt: isoDateTime.optional(),
  modifiedAt: isoDateTime.optional(),
  modificationCount: z.number().int().min(0).optional(),
  statusHistory: z.array(z.object({
    status: z.string(),
    timestamp: z.string(),
    by: z.string().optional(),
  })).optional(),
  communicationLog: z.array(z.object({
    type: z.enum(['menu_sent', 'order_summary_sent', 'delivery_address_sent', 'motorizado_contact_sent', 'payment_confirmed']),
    phone: z.string(),
    timestamp: z.string(),
    messagePreview: z.string().optional(),
  })).optional(),
});

export type Sale = z.infer<typeof SaleSchema>;

export const SaleItemSchema = z.object({
  id: z.string().uuid(),
  // TODO-L-02: tenantId debería validarse como slug o UUID
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
  createdAt: isoDateTime,
  // AUDIT-012: FIFO restore (track original lot consumption for void)
  consumedLots: z.array(z.object({ lotId: z.string(), quantity: z.number().positive() })).optional(),
});

export type SaleItem = z.infer<typeof SaleItemSchema>;

export const CashRegisterSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  isOpen: z.boolean(),
  openedBy: z.string().uuid().nullable(),
  openedAt: isoDateTime.nullable(),
  openingBalanceBs: z.number().min(0).nullable(),
  openingRate: z.number().positive().nullable(),
  closedBy: z.string().uuid().nullable(),
  closedAt: isoDateTime.nullable(),
  closingBalanceBs: z.number().nullable(),
  closingRate: z.number().positive().nullable(),
  expectedClosingBs: z.number().nullable(),
  differenceBs: z.number().nullable(),
  totalSalesCount: z.number().int().min(0),
  totalSalesBs: z.number().min(0),
  totalIgtfBs: z.number().min(0),
  collectedDebtBs: z.number().min(0).default(0), // FUGA-1: Cobros de deuda acumulados en caja
  registerId: z.string().uuid().optional(), // PLAN-MULTICAJAS: FK a registers_config
  operatorId: z.string().uuid().optional(), // PLAN-MULTICAJAS: FK a users
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.nullable().optional(), // POS-002 (M-1): acepta null | undefined para Dexie
});

export type CashRegister = z.infer<typeof CashRegisterSchema>;

export const RegisterConfigSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  name: z.string().min(1, 'Nombre de la caja requerido').max(50),
  isActive: z.boolean().default(true),
  createdAt: isoDateTime,
});

export type RegisterConfig = z.infer<typeof RegisterConfigSchema>;

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
  isCreditSale: z.boolean().optional().default(false),
  cashRegisterId: z.string().uuid().optional(),
});

export type CreateSaleInput = z.infer<typeof CreateSaleInputSchema>;

export const OpenCashRegisterInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
  openingBalanceBs: z.number().positive('Monto inicial debe ser mayor a 0'),
  openingRate: z.number().positive('Se requiere tasa de cambio al abrir la caja'),
  registerId: z.string().uuid().optional(),
});

export type OpenCashRegisterInput = z.infer<typeof OpenCashRegisterInputSchema>;

export const CloseCashRegisterInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
  declaredClosingBalanceBs: z.number().min(0, 'Monto final declarado requerido'),
  closingRate: z.number().positive('Se requiere tasa de cambio al cerrar la caja'),
  sessionId: z.string().uuid().optional(),
});

export type CloseCashRegisterInput = z.infer<typeof CloseCashRegisterInputSchema>;

// ===== Payment Metadata =====

export const METADATA_PAGOS = {
  efectivo_bs: { label: 'Efectivo', moneda: 'Bs', requiereVuelto: true, aplicaIgtf: false },
  pago_movil: { label: 'P Móvil', moneda: 'Bs', requiereVuelto: false, aplicaIgtf: false },
  tarjeta_bs: { label: 'Tarjeta', moneda: 'Bs', requiereVuelto: false, aplicaIgtf: false },
  efectivo_usd: { label: 'Efectivo $', moneda: 'USD', requiereVuelto: true, aplicaIgtf: true },
  credito: { label: 'A crédito', moneda: 'USD', requiereVuelto: false, aplicaIgtf: false },
} as const;

export { calculateSaleTotals } from './utils';
export type { SaleTotals } from './utils';
