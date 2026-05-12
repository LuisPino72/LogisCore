import { z } from 'zod';

/** Purchases Spec - PURCH-001..005 */

export const PurchaseStatusSchema = z.enum(['draft', 'confirmed', 'received']);
export type PurchaseStatus = z.infer<typeof PurchaseStatusSchema>;

export const PurchaseItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  quantity: z.number().positive(),
  costUsd: z.number().positive(),
  costBs: z.number().positive(),
  receivedQuantity: z.number().positive().optional(),
});

export type PurchaseItem = z.infer<typeof PurchaseItemSchema>;

export const PurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  supplierName: z.string().min(1),
  items: z.array(PurchaseItemSchema),
  totalUsd: z.number().positive(),
  totalBs: z.number().positive(),
  exchangeRate: z.number().positive(),
  status: PurchaseStatusSchema,
  createdAt: z.string().datetime(),
});

export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export const FIFOLayerSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  costUsd: z.number().positive(),
  createdAt: z.string().datetime(),
});

export type FIFOLayer = z.infer<typeof FIFOLayerSchema>;