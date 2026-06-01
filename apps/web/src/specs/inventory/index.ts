import { z } from 'zod';

/** Inventory Spec - INV-001..006 */

export const PESABLE_UNITS = ['kg', 'gr', 'lt', 'm'] as const;
export type WeightUnit = typeof PESABLE_UNITS[number];

export const ProductTypeEnum = z.enum(['materia_prima', 'producto_terminado', 'both']);
export type ProductType = z.infer<typeof ProductTypeEnum>;

export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Nombre requerido').max(200),
  sku: z.string().min(1, 'SKU requerido').max(18),
  priceUsd: z.number().positive('Precio debe ser mayor a 0').max(999999.99),
  categoryId: z.string().uuid().optional(),
  isWeighted: z.boolean(),
  isTaxable: z.boolean().default(true),
  isSellable: z.boolean().default(true),
  unit: z.union([z.enum(PESABLE_UNITS), z.literal('unidad')]),
  /** Stock en unidades de almacenamiento (gramos para kg, mililitros para lt, unidades para unidad) */
  stock: z.number().int().min(0),
  stockMin: z.number().int().min(0).optional(),
  imageUrl: z.string().optional(),
  costPrice: z.number().min(0).optional(),
  productType: ProductTypeEnum.default('materia_prima').optional(),
  deletedAt: z.string().datetime().optional(),
});

export type Product = z.infer<typeof ProductSchema>;

export const CreateProductInputSchema = ProductSchema.omit({
  id: true,
  stock: true,
  deletedAt: true,
}).extend({
  categoryId: z.string().uuid('Selecciona una categoría'),
  costPrice: z.number().min(0, 'El costo no puede ser negativo').max(9999.99, 'El costo es demasiado alto').optional(),
}).strict();

export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;

export const PresentationSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  name: z.string().min(1, 'Nombre requerido').max(100),
  priceUsd: z.number().positive('Precio debe ser mayor a 0'),
  unitMultiplier: z.number().positive('El multiplicador debe ser mayor a 0').default(1),
  stockType: z.literal('shared'),
  barcode: z.string().max(50).optional(),
  sortOrder: z.number().int().default(0),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().optional(),
});

export type Presentation = z.infer<typeof PresentationSchema>;

export const CreatePresentationInputSchema = PresentationSchema.omit({
  id: true,
  productId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
}).extend({
  stockInicial: z.number().int().min(0).optional(),
});

export type CreatePresentationInput = z.infer<typeof CreatePresentationInputSchema>;

export const CreateProductWithPresentationsInputSchema = CreateProductInputSchema.extend({
  presentations: z.array(CreatePresentationInputSchema),
  stockType: z.literal('shared'),
});

export type CreateProductWithPresentationsInput = z.infer<typeof CreateProductWithPresentationsInputSchema>;

export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  isPredefined: z.boolean().optional(),
});

export type Category = z.infer<typeof CategorySchema>;

export const InventoryMovementSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  productId: z.string().uuid(),
  type: z.enum(['sale', 'purchase', 'adjustment']),
  quantity: z.number(),
  previousStock: z.number().int(),
  newStock: z.number().int(),
  createdAt: z.string().datetime(),
  userId: z.string().uuid(),
  reason: z.string().optional(),
  reasonType: z.string().optional(),
  costUsd: z.number().optional(),
});

export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;