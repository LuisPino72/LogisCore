import { z } from 'zod';

/** Inventory Spec - INV-001..006 */

export const PESABLE_UNITS = ['kg', 'gr', 'lt', 'm'] as const;
export type WeightUnit = typeof PESABLE_UNITS[number];

export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Nombre requerido').max(200),
  sku: z.string().min(1, 'SKU requerido').max(50),
  priceUsd: z.number().positive('Precio debe ser mayor a 0').max(999999.99),
  categoryId: z.string().uuid().optional(),
  isWeighted: z.boolean(),
  unit: z.union([z.enum(PESABLE_UNITS), z.literal('unidad')]),
  stock: z.number().int().min(0),
  stockMin: z.number().int().min(0).optional(),
  deletedAt: z.string().datetime().optional(),
});

export type Product = z.infer<typeof ProductSchema>;

export const CreateProductInputSchema = ProductSchema.omit({
  id: true,
  stock: true,
  deletedAt: true,
}).extend({
  categoryId: z.string().uuid('Selecciona una categoría'),
}).strict();

export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;

export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
});

export type Category = z.infer<typeof CategorySchema>;

export const InventoryMovementSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  type: z.enum(['sale', 'purchase', 'adjustment']),
  quantity: z.number(),
  previousStock: z.number().int(),
  newStock: z.number().int(),
  createdAt: z.string().datetime(),
  userId: z.string().uuid(),
  reason: z.string().optional(),
});

export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;