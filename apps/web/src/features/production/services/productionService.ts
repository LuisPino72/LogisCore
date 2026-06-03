import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { emitWithPersistence } from '../../../services/audit/emitWithAudit';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { ProductionErrors } from '../../../specs/production/errors';
import { CreateRecipeInputSchema, UpdateRecipeInputSchema, CreateProductionOrderInputSchema } from '../../../specs/production';
import { logger } from '../../../lib/logger';
import type { Recipe, RecipeLine, ProductionOrder, CreateRecipeInput, CreateProductionOrderInput, UpdateRecipeInput, RecipeWithLines, IngredientAvailability } from '../types';

/**
 * Convierte la cantidad de un ingrediente (en la unidad declarada en la receta)
 * a la unidad de almacenamiento del producto (gramos para kg, ml para lt, unidades para unidad).
 */
function recipeQtyToStorage(qty: number, recipeUnit: string, productUnit: string): number {
  if (productUnit === 'kg' && recipeUnit === 'g') return qty;
  if (productUnit === 'kg' && recipeUnit === 'kg') return qty * 1000;
  if (productUnit === 'lt' && recipeUnit === 'ml') return qty;
  if (productUnit === 'lt' && recipeUnit === 'lt') return qty * 1000;
  if (productUnit === 'unidad' && recipeUnit === 'unidad') return qty;
  if (productUnit === 'gr' && recipeUnit === 'g') return qty;
  if (productUnit === 'm' && recipeUnit === 'ml') return qty;
  return qty;
}
import type { DexieRecipe, DexieRecipeLine, DexieProductionOrder } from '../../../services/dexie/db';

const PRODUCTION_MODULE = 'PRODUCTION';

function toRecipe(raw: Record<string, unknown>): Recipe {
  return {
    id: raw.id as string,
    tenantId: raw.tenantId as string,
    name: raw.name as string,
    productId: raw.productId as string,
    mode: raw.mode as Recipe['mode'],
    yieldQuantity: raw.yieldQuantity as number,
    yieldUnit: raw.yieldUnit as string,
    wastePct: raw.wastePct as number,
    isActive: raw.isActive as boolean,
    notes: raw.notes as string | undefined,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: raw.deletedAt as string | undefined,
  };
}

function toRecipeLine(raw: Record<string, unknown>): RecipeLine {
  return {
    id: raw.id as string,
    tenantId: raw.tenantId as string,
    recipeId: raw.recipeId as string,
    productId: raw.productId as string,
    quantity: raw.quantity as number,
    unit: raw.unit as string,
    sortOrder: raw.sortOrder as number,
    createdAt: raw.createdAt as string,
    deletedAt: raw.deletedAt as string | undefined,
  };
}

function toProductionOrder(raw: Record<string, unknown>): ProductionOrder {
  return {
    id: raw.id as string,
    tenantId: raw.tenantId as string,
    recipeId: raw.recipeId as string,
    productId: raw.productId as string,
    batchCount: raw.batchCount as number,
    quantityTarget: raw.quantityTarget as number,
    quantityProduced: raw.quantityProduced as number,
    status: raw.status as ProductionOrder['status'],
    plannedDate: raw.plannedDate as string | undefined,
    startedAt: raw.startedAt as string | undefined,
    completedAt: raw.completedAt as string | undefined,
    wasteNotes: raw.wasteNotes as string | undefined,
    createdBy: raw.createdBy as string,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: raw.deletedAt as string | undefined,
  };
}

export const productionService = {
  // ===== RECIPE CRUD =====

  async createRecipe(
    tenantId: string,
    userId: string,
    input: CreateRecipeInput,
  ): Promise<Result<Recipe, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    // Zod runtime validation
    const parsed = CreateRecipeInputSchema.safeParse(input);
    if (!parsed.success) {
      return failure(new AppError(ProductionErrors.RECIPE_INVALID_INPUT, parsed.error.issues[0]?.message || 'Datos inválidos.'));
    }

    const db = getDb();
    const now = new Date().toISOString();

    // AUDIT-CRUD-001: Tenant-leak fix — filtrar producto por tenantId antes de operar
    const product = await db.products
      .where({ tenantId, id: input.productId })
      .filter((p) => !p.deletedAt)
      .first();
    if (!product) {
      return failure(new AppError(ProductionErrors.RECIPE_PRODUCT_NOT_FOUND, 'Producto terminado no encontrado.'));
    }
    if (product.productType && product.productType === 'materia_prima') {
      return failure(new AppError(ProductionErrors.RECIPE_PRODUCT_TYPE_INVALID, 'El producto seleccionado es materia prima, no se puede producir. Selecciona un producto terminado.'));
    }
    if (product.stock <= 0) {
      return failure(new AppError(ProductionErrors.RECIPE_PRODUCT_NO_STOCK, `"${product.name}" no tiene stock. Agrega stock inicial al producto antes de crear una receta.`));
    }

    // Check duplicate recipe name
    const existingName = await db.recipes
      .where({ tenantId, name: input.name })
      .filter((r) => !r.deletedAt)
      .first();
    if (existingName) {
      return failure(new AppError(ProductionErrors.RECIPE_DUPLICATE_NAME, 'Ya existe una receta con ese nombre.'));
    }

    // Check duplicate recipe batch for same product
    if (input.mode === 'batch') {
      const existing = await db.recipes
        .where({ tenantId, productId: input.productId, mode: 'batch' })
        .filter((r) => !r.deletedAt)
        .first();
      if (existing) {
        return failure(new AppError(ProductionErrors.RECIPE_DUPLICATE_PRODUCT, 'Este producto ya tiene una receta de producción por lotes.'));
      }
    }

    // Validate ingredients exist and have valid productType
    for (const line of input.lines) {
      const ingredient = await db.products.get(line.productId);
      if (!ingredient || ingredient.deletedAt) {
        return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_NOT_FOUND, `Ingrediente no encontrado: ${line.productId}`));
      }
      if (ingredient.productType && ingredient.productType === 'producto_terminado') {
        return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_TYPE_INVALID, `"${ingredient.name}" es un producto terminado, no puede usarse como ingrediente.`));
      }
      if (ingredient.stock <= 0) {
        return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_NO_STOCK, `"${ingredient.name}" no tiene stock. Agrega stock al producto antes de usarlo como ingrediente.`));
      }
      const needed = recipeQtyToStorage(line.quantity, line.unit, ingredient.unit);
      if (needed > ingredient.stock) {
        return failure(new AppError(
          ProductionErrors.RECIPE_INGREDIENT_EXCEEDS_STOCK,
          `"${ingredient.name}" tiene ${ingredient.stock} ${ingredient.unit} pero la receta pide ${line.quantity} ${line.unit}. Reduce la cantidad de la receta, o si el stock real es distinto al del sistema, ve a Ajustes para corregirlo.`,
        ));
      }
    }

    const recipeId = generateId();
    const recipe: DexieRecipe = {
      id: recipeId,
      tenantId,
      name: input.name,
      productId: input.productId,
      mode: input.mode,
      yieldQuantity: input.yieldQuantity,
      yieldUnit: input.yieldUnit,
      wastePct: input.wastePct ?? 0,
      isActive: true,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };

    const lineRecords: DexieRecipeLine[] = input.lines.map((line, i) => ({
      id: generateId(),
      tenantId,
      recipeId,
      productId: line.productId,
      quantity: line.quantity,
      unit: line.unit,
      sortOrder: i,
      createdAt: now,
    }));

    try {
      const ev = emitWithPersistence('PRODUCTION.CREATED', PRODUCTION_MODULE, { recipeId, name: input.name, productId: input.productId }, { userId, tenantId });
      await db.transaction('rw', [db.recipes, db.recipeLines, db.syncQueue, db.outbox], async () => {
        await db.recipes.add(recipe);
        await syncQueue.enqueue('recipes', 'CREATE', recipeId, toSnake(recipe as unknown as Record<string, unknown>), tenantId);

        for (const line of lineRecords) {
          await db.recipeLines.add(line);
          await syncQueue.enqueue('recipe_lines', 'CREATE', line.id, toSnake(line as unknown as Record<string, unknown>), tenantId);
        }

        await ev.enqueueInTransaction();
      });

      await ev.auditAfterTransaction();

      return success(toRecipe(recipe as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en createRecipe:', err);
      return failure(new AppError(ProductionErrors.RECIPE_CREATE_FAILED, 'Error al crear la receta.'));
    }
  },

  async updateRecipe(
    id: string,
    input: UpdateRecipeInput,
    tenantId: string,
  ): Promise<Result<Recipe, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    // Zod runtime validation
    if (Object.keys(input).length > 0) {
      const parsed = UpdateRecipeInputSchema.safeParse(input);
      if (!parsed.success) {
        return failure(new AppError(ProductionErrors.RECIPE_INVALID_INPUT, parsed.error.issues[0]?.message || 'Datos inválidos.'));
      }
    }

    const db = getDb();
    const existing = await db.recipes.where({ id }).filter((r) => r.tenantId === tenantId && !r.deletedAt).first();
    if (!existing) {
      return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
    }

    // C6: Validate ingredients BEFORE transaction
    if (input.lines) {
      for (const line of input.lines) {
        const lineRaw = line as Record<string, unknown>;
        if (!lineRaw.id) {
          const ingredient = await db.products.get(line.productId);
          if (!ingredient || ingredient.deletedAt) {
            return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_NOT_FOUND, `Ingrediente no encontrado: ${line.productId}`));
          }
          if (ingredient.productType && ingredient.productType === 'producto_terminado') {
            return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_TYPE_INVALID, `"${ingredient.name}" es un producto terminado, no puede usarse como ingrediente.`));
          }
          if (ingredient.stock <= 0) {
            return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_NO_STOCK, `"${ingredient.name}" no tiene stock. Agrega stock al producto antes de usarlo como ingrediente.`));
          }
          const needed = recipeQtyToStorage(line.quantity, line.unit, ingredient.unit);
          if (needed > ingredient.stock) {
            return failure(new AppError(
              ProductionErrors.RECIPE_INGREDIENT_EXCEEDS_STOCK,
              `"${ingredient.name}" tiene ${ingredient.stock} ${ingredient.unit} pero la receta pide ${line.quantity} ${line.unit}. Reduce la cantidad de la receta, o si el stock real es distinto al del sistema, ve a Ajustes para corregirlo.`,
            ));
          }
        }
      }
    }

    const now = new Date().toISOString();
    const updated: DexieRecipe = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.yieldQuantity !== undefined && { yieldQuantity: input.yieldQuantity }),
      ...(input.yieldUnit !== undefined && { yieldUnit: input.yieldUnit }),
      ...(input.wastePct !== undefined && { wastePct: input.wastePct }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: now,
    };

    try {
      const ev = emitWithPersistence('PRODUCTION.UPDATED', PRODUCTION_MODULE, { recipeId: id, changes: Object.keys(input) }, { userId: undefined, tenantId });
      await db.transaction('rw', [db.recipes, db.recipeLines, db.syncQueue, db.outbox], async () => {
        await db.recipes.put(updated);
        await syncQueue.enqueue('recipes', 'UPDATE', id, toSnake(updated as unknown as Record<string, unknown>), tenantId);

    // Update lines if provided
    if (input.lines) {
          const existingLines = await db.recipeLines
            .where({ recipeId: id })
            .filter((l) => !l.deletedAt)
            .toArray();

          const existingIds = new Set(existingLines.map((l) => l.id));
          const submittedIds = new Set(input.lines.filter((l) => 'id' in l && l.id).map((l) => (l as Record<string, unknown>).id as string));

          // Delete removed lines
          for (const line of existingLines) {
            if (!submittedIds.has(line.id)) {
              await db.recipeLines.update(line.id, { deletedAt: now });
              await syncQueue.enqueue('recipe_lines', 'DELETE', line.id, { id: line.id, deleted_at: now }, tenantId);
            }
          }

          // Create or update lines
          for (let i = 0; i < input.lines.length; i++) {
            const line = input.lines[i];
            const lineRaw = line as Record<string, unknown>;
            const existingLineId = lineRaw.id as string | undefined;

            if (existingLineId && existingIds.has(existingLineId)) {
              // Update existing line
              const patchData = {
                quantity: line.quantity,
                unit: line.unit,
                sortOrder: i,
              };
              await db.recipeLines.update(existingLineId, patchData);
              await syncQueue.enqueue('recipe_lines', 'UPDATE', existingLineId, toSnake({ id: existingLineId, ...patchData } as Record<string, unknown>), tenantId);
            } else {
              // Create new line
              const lineId = generateId();
              const newLine: DexieRecipeLine = {
                id: lineId,
                tenantId,
                recipeId: id,
                productId: line.productId,
                quantity: line.quantity,
                unit: line.unit,
                sortOrder: i,
                createdAt: now,
              };
              await db.recipeLines.add(newLine);
              await syncQueue.enqueue('recipe_lines', 'CREATE', lineId, toSnake(newLine as unknown as Record<string, unknown>), tenantId);
            }
          }
        }

        await ev.enqueueInTransaction();
      });

      await ev.auditAfterTransaction();
      return success(toRecipe(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en updateRecipe:', err);
      return failure(new AppError(ProductionErrors.RECIPE_UPDATE_FAILED, 'Error al actualizar la receta.'));
    }
  },

  async deleteRecipe(id: string, tenantId: string): Promise<Result<void, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    // AUDIT-CRUD-002: Tenant-leak fix — filtrar receta por tenantId antes de soft-delete
    const recipe = await db.recipes
      .where({ tenantId, id })
      .filter((r) => !r.deletedAt)
      .first();
    if (!recipe) {
      return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
    }

    // Check if there are active production orders
    const activeOrders = await db.productionOrders
      .where({ recipeId: id })
      .filter((o) => !o.deletedAt && (o.status === 'confirmed' || o.status === 'in_progress'))
      .count();
    if (activeOrders > 0) {
      return failure(new AppError(ProductionErrors.RECIPE_HAS_ORDERS, `No se puede eliminar: tiene ${activeOrders} orden(es) de producción activa(s).`));
    }

    const deletedAt = new Date().toISOString();
    const lines = await db.recipeLines.where({ recipeId: id }).filter((l) => !l.deletedAt).toArray();

    try {
      const ev = emitWithPersistence('PRODUCTION.DELETED', PRODUCTION_MODULE, { recipeId: id, cascadeLines: lines.length }, { userId: undefined, tenantId });
      await db.transaction('rw', [db.recipes, db.recipeLines, db.syncQueue, db.outbox], async () => {
        for (const line of lines) {
          await db.recipeLines.update(line.id, { deletedAt });
          await syncQueue.enqueue('recipe_lines', 'DELETE', line.id, { id: line.id, deleted_at: deletedAt }, tenantId);
        }

        await db.recipes.update(id, { deletedAt });
        await syncQueue.enqueue('recipes', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
        await ev.enqueueInTransaction();
      });

      await ev.auditAfterTransaction();
      return success(undefined);
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en deleteRecipe:', err);
      return failure(new AppError(ProductionErrors.RECIPE_DELETE_FAILED, 'Error al eliminar la receta.'));
    }
  },

  async getRecipes(tenantId: string, filters?: { query?: string; mode?: string; isActive?: boolean }): Promise<Result<Recipe[], AppError>> {
    const db = getDb();
    try {
      let rows = await db.recipes
        .where({ tenantId })
        .filter((r) => !r.deletedAt)
        .toArray();

      if (filters?.query) {
        const q = filters.query.toLowerCase();
        rows = rows.filter((r) => r.name.toLowerCase().includes(q));
      }
      if (filters?.mode) {
        rows = rows.filter((r) => r.mode === filters.mode);
      }
      if (filters?.isActive !== undefined) {
        rows = rows.filter((r) => r.isActive === filters.isActive);
      }

      return success(rows.map((r) => toRecipe(r as unknown as Record<string, unknown>)));
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en getRecipes:', err);
      return failure(new AppError('PRODUCTION_RECIPES_QUERY_FAILED', 'Error al cargar recetas.'));
    }
  },

  async getRecipeById(tenantId: string, id: string): Promise<Result<Recipe, AppError>> {
    try {
      const db = getDb();
      // AUDIT-CRUD-003: Tenant-leak fix — filtrar receta por tenantId
      const recipe = await db.recipes
        .where({ tenantId, id })
        .filter((r) => !r.deletedAt)
        .first();
      if (!recipe) {
        return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
      }
      return success(toRecipe(recipe as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en getRecipeById:', err);
      return failure(new AppError('RECIPE_FETCH_FAILED', 'Error al cargar la receta.'));
    }
  },

  async getRecipeWithLines(recipeId: string): Promise<Result<RecipeWithLines, AppError>> {
    const db = getDb();
    const recipe = await db.recipes.get(recipeId);
    if (!recipe || recipe.deletedAt) {
      return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
    }

    const lines = await db.recipeLines
      .where({ recipeId })
      .filter((l) => !l.deletedAt)
      .sortBy('sortOrder');

    return success({
      recipe: toRecipe(recipe as unknown as Record<string, unknown>),
      lines: lines.map((l) => toRecipeLine(l as unknown as Record<string, unknown>)),
    });
  },

  // ===== PRODUCTION ORDERS (BATCH) =====

  async checkIngredientsAvailability(
    recipeId: string,
    batchCount: number,
  ): Promise<Result<IngredientAvailability[], AppError>> {
    try {
      const db = getDb();
      const recipe = await db.recipes.get(recipeId);
      if (!recipe || recipe.deletedAt) {
        return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
      }

      const lines = await db.recipeLines
        .where({ recipeId })
        .filter((l) => !l.deletedAt)
        .toArray();

      const wasteMultiplier = 1 + (recipe.wastePct / 100);
      const result: IngredientAvailability[] = [];

      for (const line of lines) {
        const needed = Math.ceil(line.quantity * batchCount * wasteMultiplier);
        const product = await db.products.get(line.productId);
        const available = product ? product.stock : 0;
        const productName = product ? product.name : 'Desconocido';

        result.push({
          productId: line.productId,
          productName,
          needed,
          available,
          unit: line.unit,
          sufficient: available >= needed,
        });
      }

      return success(result);
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en checkIngredientsAvailability:', err);
      return failure(new AppError('PRODUCTION_AVAILABILITY_CHECK_FAILED', 'Error al verificar disponibilidad de ingredientes.'));
    }
  },

  async calculateRecipeCost(
    recipeId: string,
    batchCount: number,
  ): Promise<Result<number, AppError>> {
    try {
      const db = getDb();
      const recipe = await db.recipes.get(recipeId);
      if (!recipe || recipe.deletedAt) {
        return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
      }

      const lines = await db.recipeLines
        .where({ recipeId })
        .filter((l) => !l.deletedAt)
        .toArray();

      if (lines.length === 0) {
        return failure(new AppError(ProductionErrors.RECIPE_NO_INGREDIENTS, 'La receta no tiene ingredientes para calcular costo.'));
      }

      const wasteMultiplier = 1 + (recipe.wastePct / 100);
      let totalCost = 0;

      for (const line of lines) {
        const needed = line.quantity * batchCount * wasteMultiplier;
        const product = await db.products.get(line.productId);
        if (product && product.costPrice != null && product.costPrice > 0) {
          const costPerStorageUnit = product.isWeighted
            ? product.costPrice / 1000
            : product.costPrice;
          totalCost += needed * costPerStorageUnit;
        }
      }

      return success(preciseRound(totalCost, 2));
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en calculateRecipeCost:', err);
      return failure(new AppError('PRODUCTION_COST_CALC_FAILED', 'Error al calcular costo de la receta.'));
    }
  },

  async createOrder(
    tenantId: string,
    userId: string,
    input: CreateProductionOrderInput,
  ): Promise<Result<ProductionOrder, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    // Zod runtime validation
    const parsed = CreateProductionOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      return failure(new AppError(ProductionErrors.ORDER_INVALID_INPUT, parsed.error.issues[0]?.message || 'Datos inválidos.'));
    }

    const db = getDb();
    const now = new Date().toISOString();

    // 1. Validate recipe
    const recipe = await db.recipes.get(input.recipeId);
    if (!recipe || recipe.deletedAt) {
      return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
    }
    if (recipe.mode !== 'batch') {
      return failure(new AppError(ProductionErrors.ORDER_RECIPE_NOT_BATCH, 'Esta receta es de ensamblaje, no de producción por lotes.'));
    }
    if (!recipe.isActive) {
      return failure(new AppError(ProductionErrors.RECIPE_INACTIVE, 'Esta receta está desactivada. Actívala antes de producir.'));
    }
    if (recipe.wastePct < 0 || recipe.wastePct > 100) {
      return failure(new AppError(ProductionErrors.RECIPE_INVALID_INPUT, 'El porcentaje de merma de la receta es inválido.'));
    }
    if (input.batchCount > 1000) {
      return failure(new AppError(ProductionErrors.ORDER_BATCH_COUNT_EXCEEDED, 'No se pueden producir más de 1000 lotes por orden.'));
    }
    if (input.batchCount < 1) {
      return failure(new AppError(ProductionErrors.ORDER_BATCH_COUNT_INVALID, 'Debes producir al menos 1 lote.'));
    }

    // 2. Get recipe lines
    const lines = await db.recipeLines
      .where({ recipeId: input.recipeId })
      .filter((l) => !l.deletedAt)
      .toArray();

    if (lines.length === 0) {
      return failure(new AppError(ProductionErrors.RECIPE_NO_INGREDIENTS, 'La receta no tiene ingredientes.'));
    }

    // 3. Calculate quantities with waste
    const wasteMultiplier = 1 + (recipe.wastePct / 100);
    const quantityTarget = recipe.yieldQuantity * input.batchCount;

    // 4. Check ingredient availability
    for (const line of lines) {
      const needed = Math.ceil(line.quantity * input.batchCount * wasteMultiplier);
      const product = await db.products.get(line.productId);
      if (!product || product.stock < needed) {
        const productName = product?.name || 'Desconocido';
        const available = product?.stock || 0;
        return failure(
          new AppError(
            ProductionErrors.ORDER_INSUFFICIENT_STOCK,
            `Stock insuficiente de "${productName}": necesitas ${needed}, tienes ${available}.`,
          ),
        );
      }
    }

    // 5. Calculate cost of ingredients consumed
    let totalIngredientCost = 0;
    for (const line of lines) {
      const needed = Math.ceil(line.quantity * input.batchCount * wasteMultiplier);
      const product = await db.products.get(line.productId);
      if (product && product.costPrice != null) {
        const costPerStorageUnit = product.isWeighted
          ? product.costPrice / 1000
          : product.costPrice;
        totalIngredientCost += needed * costPerStorageUnit;
      }
    }
    const costPerProducedUnit = quantityTarget > 0
      ? preciseRound(totalIngredientCost / quantityTarget, 4)
      : 0;

    // 6. Atomic transaction
    // Re-validate stock right before transaction (concurrency guard)
    for (const line of lines) {
      const needed = Math.ceil(line.quantity * input.batchCount * wasteMultiplier);
      const freshProduct = await db.products.get(line.productId);
      if (!freshProduct || freshProduct.stock < needed) {
        const productName = freshProduct?.name || 'Desconocido';
        const available = freshProduct?.stock || 0;
        return failure(
          new AppError(
            ProductionErrors.ORDER_INSUFFICIENT_STOCK,
            `Stock insuficiente de "${productName}" (verificación final): necesitas ${needed}, tienes ${available}.`,
          ),
        );
      }
    }

    try {
      const orderId = generateId();
      const ev = emitWithPersistence('PRODUCTION.COMPLETED', PRODUCTION_MODULE, {
        orderId,
        recipeId: input.recipeId,
        productId: recipe.productId,
        batchCount: input.batchCount,
        quantityTarget,
      }, { userId, tenantId });

      await db.transaction('rw', [
        db.productionOrders, db.products, db.inventoryMovements,
        db.inventoryLots, db.syncQueue, db.outbox,
      ], async () => {
        // a. Create production order
        const order: DexieProductionOrder = {
          id: orderId,
          tenantId,
          recipeId: input.recipeId,
          productId: recipe.productId,
          batchCount: input.batchCount,
          quantityTarget,
          quantityProduced: 0,
          status: 'confirmed',
          plannedDate: input.plannedDate,
          wasteNotes: input.notes,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        };
        await db.productionOrders.add(order);
        await syncQueue.enqueue('production_orders', 'CREATE', orderId, toSnake(order as unknown as Record<string, unknown>), tenantId);

        // b. Consume ingredients
        for (const line of lines) {
          const needed = Math.ceil(line.quantity * input.batchCount * wasteMultiplier);
          const product = await db.products.get(line.productId);
          if (!product) throw new AppError(ProductionErrors.RECIPE_INGREDIENT_NOT_FOUND, 'Ingrediente no encontrado.');

          const previousStock = product.stock;
          const newStock = previousStock - needed;

          await db.products.update(line.productId, { stock: newStock });
          await syncQueue.enqueue('products', 'UPDATE', line.productId, toSnake({ ...product, stock: newStock } as unknown as Record<string, unknown>), tenantId);

          // Consume FIFO lots
          const fifoResult = await consumeFifoInternal(line.productId, needed, tenantId);
          if (!fifoResult.ok) throw fifoResult.error;

          // Create inventory movement
          const movementId = generateId();
          const movement = {
            id: movementId,
            tenantId,
            productId: line.productId,
            userId,
            type: 'adjustment' as const,
            quantity: -needed,
            previousStock,
            newStock,
            reasonType: 'consumo_interno',
            createdAt: now,
          };
          await db.inventoryMovements.add(movement);
          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
        }

        // c. Create finished product lot
        const finishedLotId = generateId();
        const finishedLot = {
          id: finishedLotId,
          tenantId,
          productId: recipe.productId,
          quantityAdded: quantityTarget,
          remainingQuantity: quantityTarget,
          costUsdPerUnit: costPerProducedUnit,
          createdAt: now,
          updatedAt: now,
        };
        await db.inventoryLots.add(finishedLot);
        await syncQueue.enqueue('inventory_lots', 'CREATE', finishedLotId, toSnake(finishedLot as unknown as Record<string, unknown>), tenantId);

        // Update finished product stock
        const finishedProduct = await db.products.get(recipe.productId);
        if (finishedProduct) {
          const prevStock = finishedProduct.stock;
          const newStock = prevStock + quantityTarget;
          await db.products.update(recipe.productId, { stock: newStock });
          await syncQueue.enqueue('products', 'UPDATE', recipe.productId, toSnake({ ...finishedProduct, stock: newStock } as unknown as Record<string, unknown>), tenantId);

          // Create movement for finished product
          const finishedMovementId = generateId();
          const finishedMovement = {
            id: finishedMovementId,
            tenantId,
            productId: recipe.productId,
            userId,
            type: 'production_output' as const,
            quantity: quantityTarget,
            previousStock: prevStock,
            newStock,
            createdAt: now,
          };
          await db.inventoryMovements.add(finishedMovement);
          await syncQueue.enqueue('inventory_movements', 'CREATE', finishedMovementId, toSnake(finishedMovement as unknown as Record<string, unknown>), tenantId);
        }

        // d. Outbox event
        await ev.enqueueInTransaction();
      });

      // 7. Audit event
      await ev.auditAfterTransaction();

      return success(toProductionOrder({
        id: orderId, tenantId, recipeId: input.recipeId, productId: recipe.productId,
        batchCount: input.batchCount, quantityTarget, quantityProduced: 0,
        status: 'confirmed', plannedDate: input.plannedDate, createdBy: userId,
        createdAt: now, updatedAt: now,
      } as unknown as Record<string, unknown>));
    } catch (err) {
      if (err instanceof AppError) return failure(err);
      logger.error(PRODUCTION_MODULE, 'Error en createOrder:', err);
      return failure(new AppError('PRODUCTION_ORDER_CREATE_FAILED', 'Error al crear la orden de producción.'));
    }
  },

  async cancelOrder(orderId: string, tenantId: string): Promise<Result<void, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    const order = await db.productionOrders.get(orderId);
    if (!order || order.deletedAt) {
      return failure(new AppError(ProductionErrors.ORDER_NOT_FOUND, 'Orden de producción no encontrada.'));
    }
    if (order.status !== 'confirmed') {
      return failure(new AppError(ProductionErrors.ORDER_INVALID_STATUS, 'Solo se pueden cancelar órdenes confirmadas.'));
    }

    const now = new Date().toISOString();

    try {
      const ev = emitWithPersistence('PRODUCTION.ORDER_CANCELLED', PRODUCTION_MODULE, { orderId }, { userId: undefined, tenantId });
      await db.transaction('rw', [
        db.productionOrders, db.products, db.inventoryMovements,
        db.inventoryLots, db.syncQueue, db.outbox,
      ], async () => {
        // Revert ingredient consumption
        const recipe = await db.recipes.get(order.recipeId);
        if (recipe) {
          const lines = await db.recipeLines
            .where({ recipeId: order.recipeId })
            .filter((l) => !l.deletedAt)
            .toArray();

          const wasteMultiplier = 1 + (recipe.wastePct / 100);

          for (const line of lines) {
            const needed = Math.ceil(line.quantity * order.batchCount * wasteMultiplier);
            const product = await db.products.get(line.productId);
            if (product) {
              const previousStock = product.stock;
              const newStock = previousStock + needed;
              await db.products.update(line.productId, { stock: newStock });
              await syncQueue.enqueue('products', 'UPDATE', line.productId, toSnake({ ...product, stock: newStock } as unknown as Record<string, unknown>), tenantId);

              const movementId = generateId();
              const movement = {
                id: movementId,
                tenantId,
                productId: line.productId,
                userId: order.createdBy,
                type: 'adjustment' as const,
                quantity: needed,
                previousStock,
                newStock,
                reasonType: 'ajuste_manual',
                createdAt: now,
              };
              await db.inventoryMovements.add(movement);
              await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
            }
          }

          // Revert finished product stock if it was produced
          const finishedProduct = await db.products.get(order.productId);
          if (finishedProduct && order.quantityTarget > 0) {
            const previousStock = finishedProduct.stock;
            const newStock = Math.max(0, previousStock - order.quantityTarget);
            await db.products.update(order.productId, { stock: newStock });
            await syncQueue.enqueue('products', 'UPDATE', order.productId, toSnake({ ...finishedProduct, stock: newStock } as unknown as Record<string, unknown>), tenantId);

            const movementId = generateId();
            const movement = {
              id: movementId,
              tenantId,
              productId: order.productId,
              userId: order.createdBy,
              type: 'adjustment' as const,
              quantity: -order.quantityTarget,
              previousStock,
              newStock,
              reasonType: 'ajuste_manual',
              createdAt: now,
            };
            await db.inventoryMovements.add(movement);
            await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
          }

          // C4: Revert finished product lot
          const finishedLots = await db.inventoryLots
            .where({ productId: order.productId })
            .filter((l) => !l.deletedAt && l.createdAt >= order.createdAt && l.createdAt <= now)
            .toArray();
          const lotToRevert = finishedLots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          if (lotToRevert && lotToRevert.remainingQuantity === lotToRevert.quantityAdded) {
            await db.inventoryLots.update(lotToRevert.id, { deletedAt: now, remainingQuantity: 0 });
            await syncQueue.enqueue('inventory_lots', 'UPDATE', lotToRevert.id, { id: lotToRevert.id, deleted_at: now, remaining_quantity: 0 }, tenantId);
          }
        }

        // Update order status
        await db.productionOrders.update(orderId, { status: 'cancelled', updatedAt: now });
        await syncQueue.enqueue('production_orders', 'UPDATE', orderId, { id: orderId, status: 'cancelled', updated_at: now }, tenantId);
        await ev.enqueueInTransaction();
      });

      await ev.auditAfterTransaction();
      return success(undefined);
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en cancelOrder:', err);
      return failure(new AppError('PRODUCTION_ORDER_CANCEL_FAILED', 'Error al cancelar la orden.'));
    }
  },

  async getOrders(
    tenantId: string,
    filters?: { status?: string; recipeId?: string },
  ): Promise<Result<ProductionOrder[], AppError>> {
    const db = getDb();
    try {
      let rows = await db.productionOrders
        .where({ tenantId })
        .filter((o) => !o.deletedAt)
        .toArray();

      if (filters?.status) {
        rows = rows.filter((o) => o.status === filters.status);
      }
      if (filters?.recipeId) {
        rows = rows.filter((o) => o.recipeId === filters.recipeId);
      }

      // Sort by createdAt descending (most recent first)
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return success(rows.map((r) => toProductionOrder(r as unknown as Record<string, unknown>)));
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en getOrders:', err);
      return failure(new AppError('PRODUCTION_ORDERS_QUERY_FAILED', 'Error al cargar órdenes de producción.'));
    }
  },

  // ===== INTERNAL HELPERS =====
};

async function consumeFifoInternal(
  productId: string,
  quantity: number,
  tenantId: string,
): Promise<Result<Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }>, AppError>> {
  const db = getDb();
  const lots = await db.inventoryLots
    .where({ productId })
    .filter((l) => !l.deletedAt && l.remainingQuantity > 0)
    .sortBy('createdAt');

  let toConsume = quantity;
  const consumed: Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }> = [];

  for (const lot of lots) {
    if (toConsume <= 0) break;

    const currentLot = await db.inventoryLots.get(lot.id);
    if (!currentLot) continue;
    if (currentLot.version !== undefined && lot.version !== undefined && currentLot.version !== lot.version) {
      return failure(new AppError('INVENTORY_LOT_FIFO_CONFLICT', 'Conflicto en consumo FIFO.'));
    }

    const consumeQty = Math.min(currentLot.remainingQuantity, toConsume);
    const newRemaining = currentLot.remainingQuantity - consumeQty;
    const newVersion = (currentLot.version ?? 0) + 1;
    await db.inventoryLots.update(lot.id, { remainingQuantity: newRemaining, version: newVersion });
    await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({
      ...lot, remainingQuantity: newRemaining, version: newVersion,
    } as unknown as Record<string, unknown>), tenantId);

    consumed.push({ lotId: lot.id, quantity: consumeQty, costUsdPerUnit: lot.costUsdPerUnit });
    toConsume -= consumeQty;
  }

  if (toConsume > 0) {
    return failure(new AppError('INVENTORY_STOCK_INSUFFICIENT', 'Stock insuficiente.'));
  }

  return success(consumed);
}
