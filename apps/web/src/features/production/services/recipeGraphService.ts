import { type Result, success, failure, AppError } from '@logiscore/core';
import { getDb } from '../../../services/dexie/db';
import { useAuthStore } from '../../auth/stores/authStore';
import { ProductionErrors } from '../../../specs/production/errors';
import type { ExpandedRecipeLine } from '../types';

const MAX_RECIPE_DEPTH = 5;

export async function expandRecipe(
  recipeId: string,
  multiplier: number,
  visited: Set<string> = new Set(),
  depth: number = 1,
): Promise<Result<ExpandedRecipeLine[], AppError>> {
  if (depth > MAX_RECIPE_DEPTH) {
    return failure(new AppError(
      ProductionErrors.RECIPE_MAX_DEPTH_EXCEEDED,
      `La receta tiene ${depth} niveles de anidamiento. Máximo permitido: ${MAX_RECIPE_DEPTH}.`,
    ));
  }

  if (visited.has(recipeId)) {
    return failure(new AppError(
      ProductionErrors.RECIPE_CYCLE_DETECTED,
      'La receta forma un ciclo. No se puede expandir.',
    ));
  }

  const db = getDb();
  const recipe = await db.recipes.get(recipeId);
  if (!recipe || recipe.deletedAt) {
    return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
  }
  if (!recipe.isActive) {
    return failure(new AppError(ProductionErrors.RECIPE_INACTIVE, 'La receta está inactiva.'));
  }

  const nextVisited = new Set(visited);
  nextVisited.add(recipeId);

  const lines = await db.recipeLines
    .where({ recipeId })
    .filter((l) => !l.deletedAt)
    .toArray();

  const result: ExpandedRecipeLine[] = [];
  const session = useAuthStore.getState().session;

  for (const line of lines) {
    const product = await db.products.where({ id: line.productId, tenantId: session?.tenantId }).first();
    if (!product || product.deletedAt) {
      return failure(new AppError(
        ProductionErrors.SUB_RECIPE_NOT_FOUND,
        'Sub-receta no encontrada para un producto de la receta.',
      ));
    }

    const isSubRecipe = product.productType === 'producto_terminado';
    let subRecipe: typeof recipe | undefined;
    if (isSubRecipe) {
      const candidates = await db.recipes
        .where({ productId: line.productId })
        .filter((r) => !r.deletedAt)
        .toArray();
      subRecipe = candidates[0];
    }

    if (subRecipe) {
      if (!subRecipe.isActive) {
        return failure(new AppError(
          ProductionErrors.SUB_RECIPE_INACTIVE,
          `La sub-receta "${product.name}" está inactiva. Actívala o usa otra.`,
        ));
      }
      const subMultiplier = (line.quantity / subRecipe.yieldQuantity) * multiplier;
      const subResult = await expandRecipe(subRecipe.id, subMultiplier, nextVisited, depth + 1);
      if (!subResult.ok) return subResult;
      result.push(...subResult.data);
    } else {
      result.push({
        productId: line.productId,
        quantity: line.quantity * multiplier,
        unit: line.unit,
        source: depth === 1 ? 'direct' : 'sub-recipe',
        path: [...Array.from(nextVisited), line.productId],
        depth,
      });
    }
  }

  return success(result);
}

export async function validateCycles(
  tenantId: string,
  productId: string,
  lines: Array<{ productId: string; quantity: number; unit: string }>,
): Promise<Result<true, AppError>> {
  const db = getDb();

  type StackFrame = { pid: string; lines: typeof lines; childIdx: number };
  const stack: StackFrame[] = [{ pid: productId, lines, childIdx: 0 }];
  const processing = new Set<string>([productId]);

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame.childIdx >= frame.lines.length) {
      stack.pop();
      processing.delete(frame.pid);
      continue;
    }

    const line = frame.lines[frame.childIdx];
    frame.childIdx++;

    if (processing.has(line.productId)) {
      return failure(new AppError(
        ProductionErrors.RECIPE_CYCLE_DETECTED,
        'No se puede guardar: la receta forma un ciclo.',
      ));
    }

    const subRecipe = await db.recipes
      .where({ productId: line.productId, tenantId })
      .filter((r) => !r.deletedAt && r.isActive)
      .first();

    if (subRecipe) {
      processing.add(line.productId);
      const subLines = await db.recipeLines
        .where({ recipeId: subRecipe.id })
        .filter((l) => !l.deletedAt)
        .toArray();
      const nextLines = subLines.map((l) => ({ productId: l.productId, quantity: l.quantity, unit: l.unit }));
      stack.push({ pid: line.productId, lines: nextLines, childIdx: 0 });
    }
  }

  return success(true);
}
