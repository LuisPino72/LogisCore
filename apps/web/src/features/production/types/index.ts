import type { z } from 'zod';
import type { AppError } from '@logiscore/core';
import type {
  RecipeSchema,
  RecipeLineSchema,
  ProductionOrderSchema,
  CreateRecipeInputSchema,
  CreateProductionOrderInputSchema,
  UpdateRecipeInputSchema,
  IngredientAvailabilitySchema,
  RecipeWithLinesSchema,
} from '../../../specs/production';

export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeLine = z.infer<typeof RecipeLineSchema>;
export type ProductionOrder = z.infer<typeof ProductionOrderSchema>;
export type CreateRecipeInput = z.infer<typeof CreateRecipeInputSchema>;
export type CreateProductionOrderInput = z.infer<typeof CreateProductionOrderInputSchema>;
export type UpdateRecipeInput = z.infer<typeof UpdateRecipeInputSchema>;
export type IngredientAvailability = z.infer<typeof IngredientAvailabilitySchema>;
export type RecipeWithLines = z.infer<typeof RecipeWithLinesSchema>;

export type RecipeMode = 'batch' | 'assembly';
export type ProductionOrderStatus = 'draft' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';

export interface ProductionState {
  recipes: Recipe[];
  productionOrders: ProductionOrder[];
  loading: boolean;
  error: AppError | null;
}

export interface RecipeFilters {
  query?: string;
  mode?: RecipeMode;
  isActive?: boolean;
  includeDeleted?: boolean;
}

export interface ProductionOrderFilters {
  status?: ProductionOrderStatus;
  recipeId?: string;
}

// PRODUCTION-001-009: Tipo de línea expandida para sub-recetas
export interface ExpandedRecipeLine {
  productId: string;
  quantity: number;
  unit: string;
  source: 'direct' | 'sub-recipe';
  path: string[];
  depth: number;
}
