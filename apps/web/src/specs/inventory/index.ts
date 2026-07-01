import { z } from 'zod';
import { isoDateTime } from '../helpers';

/** Inventory Spec - INV-001..006 */

export const PESABLE_UNITS = ['kg', 'gr', 'lt', 'm'] as const;
export type WeightUnit = typeof PESABLE_UNITS[number];

// 4 valores: la entidad Product puede tener cualquiera (Producción crea producto_terminado y both).
export const ProductTypeEnum = z.enum(['resale', 'materia_prima', 'producto_terminado', 'both']);
export type ProductType = z.infer<typeof ProductTypeEnum>;

// PRODUCTION-003 [Paso-1]: Inventario solo permite materia prima y resale. Producto terminado se crea desde Producción.
// 'raw_material' se usa en el form y se mapea a 'materia_prima' en el servicio.
export const InventoryProductTypeEnum = z.enum(['resale', 'materia_prima']);

export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Nombre requerido').max(25),
  sku: z.string().min(1, 'SKU requerido').max(25),
  // MED-6: permitir 0 para materia prima (no vendible)
  priceUsd: z.number().min(0, 'Precio no puede ser negativo').max(999999.99),
  categoryId: z.string().uuid().optional(),
  isWeighted: z.boolean(),
  isTaxable: z.boolean().default(true),
  isSellable: z.boolean().default(true),
  /** Producto intermedio creado desde receta batch. No se vende en POS, no requiere precio de venta. */
  isIngredient: z.boolean().optional(),
  unit: z.union([z.enum(PESABLE_UNITS), z.literal('unidad')]),
  /** Stock en unidades de almacenamiento (gramos para kg, mililitros para lt, unidades para unidad) */
  stock: z.number().int().min(0),
  stockMin: z.number().int().min(0).optional(),
  imageUrl: z.string().optional(),
  costPrice: z.number().min(0).optional(),
  /** Precio total pagado por el último lote comprado (display para el usuario) */
  lastLotCost: z.number().min(0).optional(),
  productType: ProductTypeEnum.default('resale').optional(),
  deletedAt: isoDateTime.nullable().optional(),
  hasAssemblyRecipe: z.boolean().optional(),
});

export type Product = z.infer<typeof ProductSchema>;

export const CreateProductInputSchema = ProductSchema.omit({
  id: true,
  stock: true,
  deletedAt: true,
}).extend({
  categoryId: z.string().uuid('Selecciona una categoría').optional(),
  costPrice: z.number().min(0.01, 'El costo debe ser mayor a 0').max(9999.99, 'El costo es demasiado alto').optional(),
  // PRODUCTION-003 [Paso-1]: el form de Inventario solo acepta estos 2 tipos.
  productType: InventoryProductTypeEnum.default('resale').optional(),
  });

export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;

export const PresentationSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  name: z.string().min(1, 'Nombre requerido').max(100),
  priceUsd: z.number().positive('Precio debe ser mayor a 0'),
  unitMultiplier: z.number().positive('El multiplicador debe ser mayor a 0').default(1),
  stockType: z.literal('shared'),
  barcode: z.string().max(50).nullable().optional(),
  sortOrder: z.number().int().default(0),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  deletedAt: isoDateTime.nullable().optional(),
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
  name: z.string().min(1).max(25),
  tenantId: z.string().uuid().nullable().optional(),
  isPredefined: z.boolean().optional(),
  defaultImageUrl: z.string().nullable().optional(),
});

export type Category = z.infer<typeof CategorySchema>;

export const InventoryMovementSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  productId: z.string().uuid(),
  type: z.enum(['sale', 'purchase', 'adjustment', 'production_output', 'production_consumption']),
  quantity: z.number(),
  previousStock: z.number().int(),
  newStock: z.number().int(),
  createdAt: z.string(),
  userId: z.string().uuid(),
  reason: z.string().nullish(),
  reasonType: z.string().nullish(),
  costUsd: z.number().nullish(),
  productionOrderId: z.string().uuid().nullish(), // FUGA-3
  consumedLots: z.string().nullish(), // FUGA-3
});

export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;

export const CreateCategoryInputSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(25, 'Máximo 25 caracteres'),
  tenantId: z.string().uuid().nullable().optional(),
  defaultImageUrl: z.string().nullable().optional(),
});

export const UpdateCategoryInputSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(25, 'Máximo 25 caracteres'),
  defaultImageUrl: z.string().nullable().optional(),
});