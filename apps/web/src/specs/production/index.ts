import { z } from 'zod';

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
  name: z.string().min(1, 'Nombre requerido').max(200),
  productId: z.string().uuid(),
  mode: RecipeModeSchema,
  yieldQuantity: z.number().int().positive('El yield debe ser mayor a 0'),
  yieldUnit: z.string().min(1),
  wastePct: z.number().min(0).max(100, 'La merma no puede ser mayor a 100%'),
  isActive: z.boolean(),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});

export type Recipe = z.infer<typeof RecipeSchema>;

// ===== RecipeLine =====

export const RecipeLineSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  recipeId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
  unit: z.string().min(1),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});

export type RecipeLine = z.infer<typeof RecipeLineSchema>;

// ===== Create Recipe Input =====

export const CreateRecipeLineInputSchema = z.object({
  productId: z.string().uuid('Selecciona un ingrediente'),
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
  unit: z.string().min(1, 'Selecciona una unidad'),
});

export const CreateRecipeInputSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(200),
  productId: z.string().uuid('Selecciona un producto terminado'),
  mode: RecipeModeSchema,
  yieldQuantity: z.number().int().positive('El yield debe ser mayor a 0'),
  yieldUnit: z.string().min(1, 'Selecciona una unidad'),
  wastePct: z.number().min(0).max(100).default(0),
  notes: z.string().optional(),
  lines: z.array(CreateRecipeLineInputSchema).min(1, 'Debe agregar al menos un ingrediente'),
});

export type CreateRecipeInput = z.infer<typeof CreateRecipeInputSchema>;

// ===== Update Recipe Input =====

export const UpdateRecipeInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  yieldQuantity: z.number().int().positive().optional(),
  yieldUnit: z.string().min(1).optional(),
  wastePct: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
  lines: z.array(CreateRecipeLineInputSchema).optional(),
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
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  wasteNotes: z.string().optional(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});

export type ProductionOrder = z.infer<typeof ProductionOrderSchema>;

// ===== Create Production Order Input =====

export const CreateProductionOrderInputSchema = z.object({
  recipeId: z.string().uuid('Selecciona una receta'),
  batchCount: z.number().int().positive('Debe producir al menos 1 lote'),
  plannedDate: z.string().optional(),
  notes: z.string().optional(),
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
