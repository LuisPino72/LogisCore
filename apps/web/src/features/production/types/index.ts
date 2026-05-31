import type { z } from 'zod';
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
  error: string | null;
}

export interface RecipeFilters {
  query?: string;
  mode?: RecipeMode;
  isActive?: boolean;
}

export interface ProductionOrderFilters {
  status?: ProductionOrderStatus;
  recipeId?: string;
}
