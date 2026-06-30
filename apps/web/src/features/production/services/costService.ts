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

export interface IngredientCost {
  productName: string;
  quantity: number;
  unit: string;
  cost: number;
}

export async function computeIngredientBreakdown(
  lines: Array<{ productId: string; quantity: number; unit: string }>,
  wastePct: number,
): Promise<IngredientCost[]> {
  const wasteMultiplier = 1 + (wastePct / 100);
  const db = getDb();
  const session = useAuthStore.getState().session;
  const results: IngredientCost[] = [];

  for (const line of lines) {
    const product = await db.products.where({ id: line.productId, tenantId: session?.tenantId }).first();
    if (!product) continue;

    let cost = 0;
    if (product.costPrice != null && product.costPrice > 0) {
      const neededInStorage = recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit);
      const needed = Math.ceil(neededInStorage);
      const costPerStorageUnit = product.isWeighted ? product.costPrice / 1000 : product.costPrice;
      cost = needed * costPerStorageUnit;
    } else if (product.productType === 'producto_terminado') {
      const subRecipe = await db.recipes
        .where({ productId: line.productId })
        .filter(r => !r.deletedAt && r.isActive)
        .first();
      if (subRecipe) {
        const subLines = await db.recipeLines
          .where({ recipeId: subRecipe.id })
          .filter(l => !l.deletedAt)
          .toArray();
        const subYield = subRecipe.yieldQuantity || 1;
        const subCost = await computeRecipeCostAsync(
          subLines.map(l => ({
            productId: l.productId,
            quantity: (l.quantity / subYield) * line.quantity * wasteMultiplier,
            unit: l.unit,
          })),
          0,
          subYield,
        );
        cost = subCost.totalCost;
      }
    } else {
      const neededInStorage = recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit);
      const needed = Math.ceil(neededInStorage);
      if (needed > 0) {
        const ccResult = await calculateConsumptionCost(line.productId, needed);
        if (ccResult.ok) cost = ccResult.data.totalCost;
      }
    }

    results.push({
      productName: product.name ?? 'Desconocido',
      quantity: line.quantity,
      unit: line.unit,
      cost: preciseRound(cost, 4),
    });
  }

  return results;
}

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

export async function computeRecipeCostAsync(
  lines: Array<{ productId: string; quantity: number; unit: string }>,
  wastePct: number,
  yieldQuantity: number,
): Promise<{ totalCost: number; costPerUnit: number }> {
  const wasteMultiplier = 1 + (wastePct / 100);
  let totalCost = 0;
  const db = getDb();
  const session = useAuthStore.getState().session;

  for (const line of lines) {
    const product = await db.products.where({ id: line.productId, tenantId: session?.tenantId }).first();
    if (!product) continue;

    const isSubRecipe = product.productType === 'producto_terminado';

    if (product.costPrice != null && product.costPrice > 0) {
      const neededInStorage = recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit);
      const needed = Math.ceil(neededInStorage);
      const costPerStorageUnit = product.isWeighted ? product.costPrice / 1000 : product.costPrice;
      totalCost += needed * costPerStorageUnit;
    } else if (isSubRecipe) {
      const subRecipe = await db.recipes
        .where({ productId: line.productId })
        .filter(r => !r.deletedAt && r.isActive)
        .first();
      if (subRecipe) {
        const subLines = await db.recipeLines
          .where({ recipeId: subRecipe.id })
          .filter(l => !l.deletedAt)
          .toArray();
        const subYield = subRecipe.yieldQuantity || 1;
        const subCost = await computeRecipeCostAsync(
          subLines.map(l => ({
            productId: l.productId,
            quantity: (l.quantity / subYield) * line.quantity * wasteMultiplier,
            unit: l.unit,
          })),
          0,
          subYield,
        );
        totalCost += subCost.totalCost;
      }
    } else {
      const neededInStorage = recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit);
      const needed = Math.ceil(neededInStorage);
      if (needed > 0) {
        const ccResult = await calculateConsumptionCost(line.productId, needed);
        if (ccResult.ok) {
          totalCost += ccResult.data.totalCost;
        }
      }
    }
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
