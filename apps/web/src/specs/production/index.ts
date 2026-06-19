import { z } from 'zod';
import { isoDateTime } from '../helpers';

/** Production Spec - PROD-001..006 */

// ===== Enums =====

export const RecipeModeSchema = z.enum(['batch', 'assembly']);
export type RecipeMode = z.infer<typeof RecipeModeSchema>;

export const ProductionOrderStatusSchema = z.enum(['draft', 'confirmed', 'in_progress', 'done', 'cancelled']);
export type ProductionOrderStatus = z.infer<typeof ProductionOrderStatusSchema>;

export const ProductTypeEnum = z.enum(['materia_prima', 'producto_terminado', 'both']);
export type ProductType = z.infer<typeof ProductTypeEnum>;

// ===== Recipe =====

export const RecipeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  name: z.string().min(1, 'Nombre requerido').max(25),
  productId: z.string().uuid(),
  mode: RecipeModeSchema,
  // PLAN-115 (CODE-MED-2): cap defensivo. yieldQuantity es int positivo sin max(),
  // exponia a inputs absurdos (1e9) que pasan Zod pero revientan UI/memoria. 10k es
  // mas que suficiente para cualquier producto realista (lotes industriales grandes).
  yieldQuantity: z.number().int().positive('El yield debe ser mayor a 0').max(10000, 'El yield no puede ser mayor a 10,000'),
  yieldUnit: z.string().min(1),
  wastePct: z.number().min(0).max(100, 'La merma no puede ser mayor a 100%'),
  isActive: z.boolean(),
  notes: z.string().max(25).optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.optional(),
});

export type Recipe = z.infer<typeof RecipeSchema>;

// ===== RecipeLine =====

export const RecipeLineSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  recipeId: z.string().uuid(),
  productId: z.string().uuid(),
  // PLAN-115 (CODE-MED-2): cap defensivo. 1M es techo realista para ingredientes en
  // cualquier unidad (kg, unidades, litros). Inputs sin cap exponen a NaN/Infinity en
  // calculateRecipeCost si el usuario tipea 1e308.
  quantity: z.number().positive('La cantidad debe ser mayor a 0').max(1_000_000, 'La cantidad no puede ser mayor a 1,000,000'),
  unit: z.string().min(1),
  sortOrder: z.number().int(),
  createdAt: isoDateTime,
  deletedAt: isoDateTime.optional(),
});

export type RecipeLine = z.infer<typeof RecipeLineSchema>;

// ===== Create Recipe Input =====

export const CreateRecipeLineInputSchema = z.object({
  productId: z.string().uuid('Selecciona un ingrediente'),
  // PLAN-115 (CODE-MED-2): cap defensivo consistente con RecipeLineSchema
  quantity: z.number().positive('La cantidad debe ser mayor a 0').max(1_000_000, 'La cantidad no puede ser mayor a 1,000,000'),
  unit: z.string().min(1, 'Selecciona una unidad'),
});

// PRODUCTION-003 [Paso-2]: productId ahora es OPCIONAL.
// Si no se proporciona, se auto-crea un producto_terminado atómicamente
// junto con la receta y sus líneas (transacción Dexie).
export const CreateRecipeInputSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(25),
  productId: z.string().uuid('Selecciona un producto terminado').optional(),
  newProductName: z.string().min(1, 'Nombre del producto requerido').max(25).optional(),
  newProductSku: z.string().min(1, 'SKU del producto requerido').max(18).optional(),
  newProductPriceUsd: z.number().positive('El precio debe ser mayor a 0').optional(),
  newProductCategoryId: z.string().uuid().optional(),
  newProductIsTaxable: z.boolean().optional(),
  mode: RecipeModeSchema,
  // PLAN-115 (CODE-MED-2): cap defensivo consistente con RecipeSchema
  yieldQuantity: z.number().int().positive('El yield debe ser mayor a 0').max(10000, 'El yield no puede ser mayor a 10,000'),
  yieldUnit: z.string().min(1, 'Selecciona una unidad'),
  wastePct: z.number().min(0).max(100).default(0),
  notes: z.string().max(25).optional(),
  lines: z.array(CreateRecipeLineInputSchema).min(1, 'Debe agregar al menos un ingrediente'),
}).refine(
  (data) => data.productId || (data.newProductName && data.newProductSku && data.newProductPriceUsd != null),
  { message: 'Debes seleccionar un producto existente o proporcionar nombre, SKU y precio del nuevo producto.', path: ['productId'] },
);

export type CreateRecipeInput = z.infer<typeof CreateRecipeInputSchema>;

// MED-5: UpdateRecipeLineInputSchema con id opcional para distinguir
// líneas existentes de nuevas en updateRecipe
export const UpdateRecipeLineInputSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid('Selecciona un ingrediente'),
  quantity: z.number().positive('La cantidad debe ser mayor a 0').max(1_000_000, 'La cantidad no puede ser mayor a 1,000,000'),
  unit: z.string().min(1, 'Selecciona una unidad'),
});

export type UpdateRecipeLineInput = z.infer<typeof UpdateRecipeLineInputSchema>;

// ===== Update Recipe Input =====

export const UpdateRecipeInputSchema = z.object({
  name: z.string().min(1).max(25).optional(),
  yieldQuantity: z.number().int().positive().optional(),
  yieldUnit: z.string().min(1).optional(),
  wastePct: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(25).optional(),
  lines: z.array(UpdateRecipeLineInputSchema).optional(),
});

export type UpdateRecipeInput = z.infer<typeof UpdateRecipeInputSchema>;

// ===== Production Order =====

export const ProductionOrderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  recipeId: z.string().uuid(),
  productId: z.string().uuid(),
  batchCount: z.number().int().positive(),
  quantityTarget: z.number().int().positive(),
  quantityProduced: z.number().int().min(0),
  status: ProductionOrderStatusSchema,
  plannedDate: z.string().optional(),
  startedAt: isoDateTime.optional(),
  completedAt: isoDateTime.optional(),
  wasteNotes: z.string().optional(),
  createdBy: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.optional(),
  // PLAN-PRODUCTION-COST: Costos FIFO capturados al momento de crear la orden
  totalCost: z.number().optional(),
  costPerUnit: z.number().optional(),
});

export type ProductionOrder = z.infer<typeof ProductionOrderSchema>;

// ===== Create Production Order Input =====

export const CreateProductionOrderInputSchema = z.object({
  recipeId: z.string().uuid('Selecciona una receta'),
  batchCount: z.number().int().positive('Debe producir al menos 1 lote'),
  plannedDate: z.string().optional(),
  notes: z.string().max(25).optional(),
});

export type CreateProductionOrderInput = z.infer<typeof CreateProductionOrderInputSchema>;

// ===== Ingredient Availability Check =====

export const IngredientAvailabilitySchema = z.object({
  productId: z.string(),
  productName: z.string(),
  needed: z.number(),
  available: z.number(),
  unit: z.string(),
  sufficient: z.boolean(),
});

export type IngredientAvailability = z.infer<typeof IngredientAvailabilitySchema>;

// ===== Recipe with Lines =====

export const RecipeWithLinesSchema = z.object({
  recipe: RecipeSchema,
  lines: z.array(RecipeLineSchema),
});

export type RecipeWithLines = z.infer<typeof RecipeWithLinesSchema>;

// ===== Calculate Recipe Cost Result =====
// PRODUCTION-003 [Paso-5]: calculateRecipeCost retorna warnings explicitos
// para ingredientes sin costo registrado (costPrice=0 o null).
// La UI muestra los warnings al bodeguero, pero NO bloquea el guardado.

export const CalculateRecipeCostResultSchema = z.object({
  totalCost: z.number(),
  warnings: z.array(z.string()).default([]),
});

export type CalculateRecipeCostResult = z.infer<typeof CalculateRecipeCostResultSchema>;
