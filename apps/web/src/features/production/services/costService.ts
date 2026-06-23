import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { useAuthStore } from '../../auth/stores/authStore';
import { ProductionErrors } from '../../../specs/production/errors';
import { calculateConsumptionCost } from './costCalculator';
import { expandRecipe } from './recipeGraphService';
import { recipeQtyToStorageBase } from './productionMappers';
import { logger } from '../../../lib/logger';
import type { CalculateRecipeCostResult } from '../../../specs/production';

export function computeRecipeCostFromLines(
  lines: Array<{ productId: string; quantity: number; unit: string }>,
  products: Map<string, { costPrice: number; isWeighted: boolean; unit: string }>,
  wastePct: number,
  yieldQuantity: number,
): { totalCost: number; costPerUnit: number } {
  const wasteMultiplier = 1 + (wastePct / 100);
  let totalCost = 0;

  for (const line of lines) {
    const product = products.get(line.productId);
    if (!product) continue;
    const neededInStorage = recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit);
    const costPerStorageUnit = product.isWeighted
      ? product.costPrice / 1000
      : product.costPrice;
    totalCost += neededInStorage * costPerStorageUnit;
  }

  return {
    totalCost: preciseRound(totalCost, 2),
    costPerUnit: yieldQuantity > 0 ? preciseRound(totalCost / yieldQuantity, 4) : 0,
  };
}

export async function calculateRecipeCost(
  recipeId: string,
  batchCount: number,
): Promise<Result<CalculateRecipeCostResult, AppError>> {
  try {
    const db = getDb();
    const recipe = await db.recipes.get(recipeId);
    if (!recipe || recipe.deletedAt) {
      return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
    }

    const expandResult = await expandRecipe(recipeId, batchCount);
    if (!expandResult.ok) return expandResult;
    const expandedLines = expandResult.data;

    if (expandedLines.length === 0) {
      return failure(new AppError(ProductionErrors.RECIPE_NO_INGREDIENTS, 'La receta no tiene ingredientes para calcular costo.'));
    }

    const wasteMultiplier = 1 + (recipe.wastePct / 100);
    let totalCost = 0;
    const warningsSet = new Set<string>();

    for (const line of expandedLines) {
      const session = useAuthStore.getState().session;
      const product = await db.products.where({ id: line.productId, tenantId: session?.tenantId }).first();
      const neededInStorage = product
        ? recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit)
        : line.quantity * wasteMultiplier;
      const needed = Math.ceil(neededInStorage);
      const ccResult = await calculateConsumptionCost(line.productId, needed);
      if (!ccResult.ok) return ccResult;
      totalCost += ccResult.data.totalCost;
      if (ccResult.data.totalCost === 0 && product) {
        warningsSet.add(`${product.name} no tiene costo registrado`);
      }
    }

    return success({
      totalCost: preciseRound(totalCost, 2),
      warnings: Array.from(warningsSet),
    });
  } catch (err) {
    logger.error('PRODUCTION', 'Error en calculateRecipeCost:', err);
    return failure(new AppError(ProductionErrors.COST_CALC_FAILED, 'Error al calcular costo de la receta.'));
  }
}
