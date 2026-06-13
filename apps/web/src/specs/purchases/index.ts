import { z } from 'zod';
import { isoDateTime } from '../helpers';

// Schemas Zod — la fuente de verdad en runtime. schema.json es solo referencial.
/** Purchases Spec - PURCH-001..005 */

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Nombre requerido').max(25),
  // AUDIT-CRUD-012: rif opcional con regex Regla #8 (V/E/J/G/P + 9 dígitos)
  rif: z.string().regex(/^[VJEGP]\d{9}$/i, 'Cédula inválida. Formato: V/E/J/G/P + 9 dígitos.').optional(),
  phone: z.string().max(14).optional(),
  createdAt: isoDateTime,
  deletedAt: isoDateTime.optional(),
});

export type Supplier = z.infer<typeof SupplierSchema>;

export const CreateSupplierInputSchema = SupplierSchema.omit({
  id: true,
  createdAt: true,
  deletedAt: true,
}).strict();

export type CreateSupplierInput = z.infer<typeof CreateSupplierInputSchema>;

export const PurchaseOrderItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  productId: z.string().uuid(),
  presentationId: z.string().uuid().optional(),
  unitMultiplier: z.number().positive().optional(),
  productName: z.string(),
  quantity: z.number().positive(),
  costUsdPerUnit: z.number().positive().max(99999.99),
  receivedQuantity: z.number().min(0).default(0),
  totalUsd: z.number().positive(),
  createdAt: isoDateTime,
  deletedAt: isoDateTime.optional(),
});

export type PurchaseOrderItem = z.infer<typeof PurchaseOrderItemSchema>;

export const PurchaseOrderStatusSchema = z.enum([
  'draft',
  'confirmed',
  'partially_received',
  'received',
  'cancelled',
]);

export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusSchema>;

export const PurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  status: PurchaseOrderStatusSchema,
  totalUsd: z.number().nonnegative(),
  notes: z.string().max(25).optional(),
  createdBy: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.optional(),
});

export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export type PurchaseOrderWithItems = PurchaseOrder & {
  items: PurchaseOrderItem[];
  supplierName?: string;
};

export const CreatePurchaseOrderInputSchema = z.object({
  supplierId: z.string().uuid('Selecciona un proveedor'),
  notes: z.string().max(25).optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid('Selecciona un producto'),
      presentationId: z.string().uuid().optional(),
      unitMultiplier: z.number().positive().optional(),
      quantity: z.number().positive('Cantidad debe ser mayor a 0'),
      totalCostUsd: z.number().positive('Costo total debe ser mayor a 0'),
    })
  ).min(1, 'La orden debe tener al menos un item'),
}).strict();

export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderInputSchema>;

export const ReceivePurchaseOrderInputSchema = z.object({
  orderId: z.string().uuid(),
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      receivedQuantity: z.number().min(0),
    })
  ).min(1),
}).strict();

export type ReceivePurchaseOrderInput = z.infer<typeof ReceivePurchaseOrderInputSchema>;
