/**
 * Production Service — Lógica de negocio de producción (recetas + órdenes).
 *
 * BUGFIX-MATHCEIL-001 (Sesión 105): La función `recipeQtyToStorage` se aplica
 * en los 7 puntos de cálculo de `needed` (checkIngredientsAvailability,
 * calculateRecipeCost, createOrder availability/cost/re-validate/consume,
 * cancelOrder revert, consumeForAssembly). Esto convierte la cantidad
 * de la unidad de receta (g, kg, ml, lt) a la unidad de almacenamiento
 * (g, ml) ANTES de aplicar `Math.ceil`, evitando que fracciones como
 * 0.5 kg se inflen a 1 kg (Math.ceil(0.5) = 1).
 *
 * Consecuencia: el sistema de producción ahora opera en storage units
 * (g/ml para pesables, unidad para no pesables). Esta convención debe
 * respetarse en todos los call-sites que calculan `needed` para inventario.
 */
import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb, type DexieInventoryLot } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { emitWithAudit, emitWithPersistence } from '../../../services/audit/emitWithAudit';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { ProductionErrors } from '../../../specs/production/errors';
import { CreateRecipeInputSchema, UpdateRecipeInputSchema, CreateProductionOrderInputSchema } from '../../../specs/production';
import { logger } from '../../../lib/logger';
import { type Transaction } from 'dexie';
import { calculateConsumptionCost, selectFifoLots } from './costCalculator';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useAuthStore } from '../../auth/stores/authStore';
import { unitToStorageType, convertToStorage } from '../../inventory/types';
import type { Recipe, RecipeLine, ProductionOrder, CreateRecipeInput, CreateProductionOrderInput, UpdateRecipeInput, RecipeWithLines, IngredientAvailability } from '../types';
import type { DexieRecipe, DexieRecipeLine, DexieProductionOrder, DexieProduct } from '../../../services/dexie/db';
import { recipeQtyToStorage, recipeQtyToStorageBase, toRecipe, toRecipeLine, toProductionOrder } from './productionMappers';
import { expandRecipe, validateCycles } from './recipeGraphService';
import { calculateRecipeCost as calculateRecipeCostFn } from './costService';

const PRODUCTION_MODULE = 'PRODUCTION';

export const productionService = {
  // ===== RECIPE CRUD =====

  async createRecipe(
    tenantId: string,
    userId: string,
    input: CreateRecipeInput,
  ): Promise<Result<Recipe, AppError>> {
    const session = useAuthStore.getState().session;
    if (!session || !hasActionPermission(session, 'production', 'create')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    // Zod runtime validation
    const parsed = CreateRecipeInputSchema.safeParse(input);
    if (!parsed.success) {
      return failure(new AppError(ProductionErrors.RECIPE_INVALID_INPUT, parsed.error.issues[0]?.message || 'Datos inválidos.'));
    }

    const db = getDb();
    const now = new Date().toISOString();

    // PRODUCTION-003 [Paso-2]: resolver productId.
    // Si el usuario seleccionó un producto existente, validarlo.
    // Si no, auto-crear producto_terminado (SKU único, stock=0).
    let resolvedProductId = input.productId;

    if (resolvedProductId) {
      // AUDIT-CRUD-001: Tenant-leak fix — filtrar producto por tenantId antes de operar
      const product = await db.products
        .where({ tenantId, id: resolvedProductId })
        .filter((p) => !p.deletedAt)
        .first();
      if (!product) {
        return failure(new AppError(ProductionErrors.RECIPE_PRODUCT_NOT_FOUND, 'Producto terminado no encontrado.'));
      }
      if (product.productType && product.productType === 'materia_prima') {
        return failure(new AppError(ProductionErrors.RECIPE_PRODUCT_TYPE_INVALID, 'El producto seleccionado es materia prima, no se puede producir. Selecciona un producto terminado.'));
      }
      // PRODUCTION-003 [Paso-2]: Removida validación de stock>0 en el producto de la receta.
      // Una receta puede existir sobre un producto con stock=0 (recién creado, o agotado);
      // el stock se actualizará al ejecutar la receta. Esta validación bloqueaba auto-creación.
    } else {
      // Auto-creación: validar campos requeridos (Zod ya refinó, defensa en profundidad)
      if (!input.newProductName) {
        return failure(new AppError(ProductionErrors.RECIPE_PRODUCT_NAME_REQUIRED, 'Nombre del producto requerido.'));
      }
      if (!input.newProductSku) {
        return failure(new AppError(ProductionErrors.RECIPE_PRODUCT_SKU_REQUIRED, 'SKU del producto requerido.'));
      }
      if (!input.newProductIsIngredient && (input.newProductPriceUsd == null || input.newProductPriceUsd <= 0)) {
        return failure(new AppError(ProductionErrors.RECIPE_PRODUCT_PRICE_REQUIRED, 'Precio del producto requerido.'));
      }
      // Validar SKU único por tenant (UNIQUE INDEX products(tenant_id, sku) en BD)
      const existingSku = await db.products
        .where({ tenantId, sku: input.newProductSku })
        .filter((p) => !p.deletedAt)
        .first();
      if (existingSku) {
        return failure(new AppError(ProductionErrors.RECIPE_PRODUCT_SKU_DUPLICATE, `Ya existe un producto con el SKU "${input.newProductSku}".`));
      }
    }

    // Check duplicate recipe name
    const existingName = await db.recipes
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.name === input.name)
      .first();
    if (existingName) {
      return failure(new AppError(ProductionErrors.RECIPE_DUPLICATE_NAME, 'Ya existe una receta con ese nombre.'));
    }

    // Check duplicate recipe for same product+mode (1:1 product:recipe per mode).
    // PLAN-115 (CODE-MED-3): ampliado a AMBOS modes. Antes solo validaba 'batch',
    // permitiendo que un producto tenga una receta 'batch' Y otra 'assembly' activas
    // simultaneamente, lo cual es semanticamente ambiguo (cual se usa en POS?).
    // Ahora: si existe recipe activa del MISMO mode, reject. Si existe del OTRO mode,
    // se permite (es valido tener ambas, una por canal).
    if (resolvedProductId) {
      const existingSameMode = await db.recipes
        .where({ tenantId, productId: resolvedProductId, mode: input.mode })
        .filter((r) => !r.deletedAt)
        .first();
      if (existingSameMode) {
        const modeLabel = input.mode === 'batch' ? 'Producir y Guardar' : 'Preparar al Momento';
        return failure(new AppError(ProductionErrors.RECIPE_DUPLICATE_PRODUCT, `Este producto ya tiene una receta de ${modeLabel}.`));
      }
    }

    // Validate ingredients exist and have valid productType
    for (const line of input.lines) {
      const ingredient = await db.products.where({ id: line.productId, tenantId }).first();
      if (!ingredient || ingredient.deletedAt) {
        return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_NOT_FOUND, 'Ingrediente no encontrado. Verifica los productos de la receta.'));
      }
      // PRODUCTION-001-003: Permitir producto_terminado SI tiene receta activa (sub-receta)
      if (ingredient.productType === 'producto_terminado') {
        const hasSubRecipe = await db.recipes
          .where({ productId: ingredient.id })
          .filter((r) => !r.deletedAt && r.isActive)
          .first();
        if (!hasSubRecipe) {
          return failure(new AppError(ProductionErrors.SUB_RECIPE_NOT_FOUND, `"${ingredient.name}" es un producto terminado sin receta activa. Crea una receta para este producto o usa otra materia prima.`));
        }
        continue;
      }
      if (ingredient.stock <= 0) {
        return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_NO_STOCK, `"${ingredient.name}" no tiene stock. Agrega stock al producto antes de usarlo como ingrediente.`));
      }
      const needed = recipeQtyToStorageBase(line.quantity, line.unit, ingredient.unit);
      if (needed > ingredient.stock) {
        return failure(new AppError(
          ProductionErrors.RECIPE_INGREDIENT_EXCEEDS_STOCK,
          `"${ingredient.name}" tiene ${ingredient.stock} ${ingredient.unit} pero la receta pide ${line.quantity} ${line.unit}. Reduce la cantidad de la receta, o si el stock real es distinto al del sistema, ve a Ajustes para corregirlo.`,
        ));
      }
    }

    // DINERO-011 (M1): validar ciclos en backend (defensa en profundidad: UI ya valida con useRecipeForm)
    if (resolvedProductId) {
      const cycleCheck = await validateCycles(
        tenantId,
        resolvedProductId,
        input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unit: l.unit })),
      );
      if (!cycleCheck.ok) {
        return failure(cycleCheck.error);
      }
    }

    const recipeId = generateId();
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

    // PRODUCTION-003 [Paso-2]: Transacción atómica.
    // Si falla CUALQUIER paso (auto-crear producto, crear receta, crear líneas, encolar outbox),
    // Dexie hace ROLLBACK completo. Si se auto-creó producto, NO queda huérfano.
    let createdProductId: string | undefined;
    let newProductRecord: DexieProduct | undefined;

    try {
      // Crear eventos ANTES de la tx (enqueueInTransaction los mete en la tx)
      const evRecipe = emitWithPersistence(
        'PRODUCTION.RECIPE_CREATED',
        PRODUCTION_MODULE,
        { recipeId, productId: resolvedProductId, name: input.name },
        { userId, tenantId },
      );

      await db.transaction(
        'rw',
        [db.products, db.recipes, db.recipeLines, db.syncQueue, db.outbox],
        async (tx) => {
          // 1. Auto-crear producto_terminado si no se proporcionó productId
          if (!resolvedProductId) {
            createdProductId = generateId();
            const isIngredient = input.newProductIsIngredient ?? false;
            const productUnit = (input.yieldUnit || 'unidad') as 'kg' | 'gr' | 'lt' | 'm' | 'unidad';
            const isWeighted = productUnit === 'kg' || productUnit === 'lt' || productUnit === 'm';
            newProductRecord = {
              id: createdProductId,
              tenantId,
              name: input.newProductName!,
              sku: input.newProductSku!,
              priceUsd: isIngredient ? 0 : input.newProductPriceUsd!,
              categoryId: input.newProductCategoryId,
              isWeighted,
              isTaxable: input.newProductIsTaxable ?? false,
              isSellable: !isIngredient,
              isIngredient,
              unit: productUnit,
              stock: 0,
              costPrice: 0,
              productType: 'producto_terminado',
            };
            await db.products.add(newProductRecord);
            // Forzar productType en Dexie después de add (defensa)
            await db.products.update(createdProductId, { productType: 'producto_terminado' });
            await syncQueue.enqueue('products', 'CREATE', createdProductId, toSnake(newProductRecord as unknown as Record<string, unknown>), tenantId);
            resolvedProductId = createdProductId;
          }

          // 2. Crear receta
          const recipe: DexieRecipe = {
            id: recipeId,
            tenantId,
            name: input.name,
            productId: resolvedProductId,
            mode: input.mode,
            yieldQuantity: input.yieldQuantity,
            yieldUnit: input.yieldUnit,
            wastePct: input.wastePct ?? 0,
            isActive: true,
            notes: input.notes,
            createdAt: now,
            updatedAt: now,
          };
          await db.recipes.add(recipe);
          await syncQueue.enqueue('recipes', 'CREATE', recipeId, toSnake(recipe as unknown as Record<string, unknown>), tenantId);

          // 3. Crear líneas
          for (const line of lineRecords) {
            await db.recipeLines.add(line);
            await syncQueue.enqueue('recipe_lines', 'CREATE', line.id, toSnake(line as unknown as Record<string, unknown>), tenantId);
          }

          // 4. Outbox events (Regla #17)
          if (newProductRecord) {
            // Si auto-creamos producto, emitimos INVENTORY.PRODUCT_CREATED
            const evProduct = emitWithPersistence(
              'INVENTORY.PRODUCT_CREATED',
              PRODUCTION_MODULE,
              { productId: createdProductId, source: 'production', name: input.newProductName, sku: input.newProductSku },
              { userId, tenantId },
            );
            await evProduct.enqueueInTransaction(tx);
          }
          // PRODUCTION.RECIPE_CREATED (siempre)
          await evRecipe.enqueueInTransaction(tx);
        },
      );

      await evRecipe.auditAfterTransaction();

      // Reconstruir el recipe final con el productId resuelto
      const finalRecipe: DexieRecipe = {
        id: recipeId,
        tenantId,
        name: input.name,
        productId: resolvedProductId!,
        mode: input.mode,
        yieldQuantity: input.yieldQuantity,
        yieldUnit: input.yieldUnit,
        wastePct: input.wastePct ?? 0,
        isActive: true,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      return success(toRecipe(finalRecipe as unknown as Record<string, unknown>));
    } catch (err) {
      console.error('[Production] Error en createRecipe:', err);
      const msg = err instanceof Error ? err.message : 'Error al crear la receta.';
      return failure(new AppError(ProductionErrors.RECIPE_CREATE_FAILED, msg));
    }
  },

  async updateRecipe(
    id: string,
    input: UpdateRecipeInput,
    tenantId: string,
  ): Promise<Result<Recipe, AppError>> {
    const session = useAuthStore.getState().session;
    if (!session || !hasActionPermission(session, 'production', 'update')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }
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

    // MED-5: Validate ALL ingredients BEFORE transaction (removed !lineRaw.id guard)
    if (input.lines) {
      for (const line of input.lines) {
        const ingredient = await db.products.where({ id: line.productId, tenantId }).first();
        if (!ingredient || ingredient.deletedAt) {
          return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_NOT_FOUND, 'Ingrediente no encontrado. Verifica los productos de la receta.'));
        }
        // PRODUCTION-001-003: Permitir producto_terminado SI tiene receta activa
        if (ingredient.productType === 'producto_terminado') {
          const hasSubRecipe = await db.recipes
            .where({ productId: ingredient.id })
            .filter((r) => !r.deletedAt && r.isActive)
            .first();
          if (!hasSubRecipe) {
            return failure(new AppError(ProductionErrors.SUB_RECIPE_NOT_FOUND, `"${ingredient.name}" es un producto terminado sin receta activa.`));
          }
          continue;
        }
        if (ingredient.stock <= 0) {
          return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_NO_STOCK, `"${ingredient.name}" no tiene stock. Agrega stock al producto antes de usarlo como ingrediente.`));
        }
        const needed = recipeQtyToStorageBase(line.quantity, line.unit, ingredient.unit);
        if (needed > ingredient.stock) {
          return failure(new AppError(
            ProductionErrors.RECIPE_INGREDIENT_EXCEEDS_STOCK,
            `"${ingredient.name}" tiene ${ingredient.stock} ${ingredient.unit} pero la receta pide ${line.quantity} ${line.unit}. Reduce la cantidad de la receta, o si el stock real es distinto al del sistema, ve a Ajustes para corregirlo.`,
          ));
        }
      }
    }

    // DINERO-011 (M1): validar ciclos en updateRecipe
    if (input.lines) {
      const cycleCheck = await validateCycles(
        tenantId,
        existing.productId,
        input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unit: l.unit })),
      );
      if (!cycleCheck.ok) {
        return failure(cycleCheck.error);
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
      const ev = emitWithPersistence('PRODUCTION.UPDATED', PRODUCTION_MODULE, { recipeId: id, changes: Object.keys(input) }, { userId: session?.userId, tenantId });
      await db.transaction('rw', [db.recipes, db.recipeLines, db.syncQueue, db.outbox], async (tx) => {
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

        await ev.enqueueInTransaction(tx);
      });

      await ev.auditAfterTransaction();
      return success(toRecipe(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en updateRecipe:', err);
      return failure(new AppError(ProductionErrors.RECIPE_UPDATE_FAILED, 'Error al actualizar la receta.'));
    }
  },

  async deleteRecipe(id: string, tenantId: string): Promise<Result<void, AppError>> {
    const session = useAuthStore.getState().session;
    if (!session || !hasActionPermission(session, 'production', 'delete')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }
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
      return failure(new AppError(ProductionErrors.RECIPE_HAS_ORDERS, `No se puede eliminar: tiene ${activeOrders} orden${activeOrders !== 1 ? 'es' : ''} de producción activa${activeOrders !== 1 ? 's' : ''}.`));
    }

    const deletedAt = new Date().toISOString();
    const lines = await db.recipeLines.where({ recipeId: id }).filter((l) => !l.deletedAt).toArray();

    try {
      const ev = emitWithPersistence('PRODUCTION.DELETED', PRODUCTION_MODULE, { recipeId: id, cascadeLines: lines.length }, { userId: undefined, tenantId });
      await db.transaction('rw', [db.recipes, db.recipeLines, db.syncQueue, db.outbox], async (tx) => {
        for (const line of lines) {
          await db.recipeLines.update(line.id, { deletedAt });
          await syncQueue.enqueue('recipe_lines', 'DELETE', line.id, { id: line.id, deleted_at: deletedAt }, tenantId);
        }

        await db.recipes.update(id, { deletedAt });
        await syncQueue.enqueue('recipes', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
        await ev.enqueueInTransaction(tx);
      });

      await ev.auditAfterTransaction();
      return success(undefined);
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en deleteRecipe:', err);
      return failure(new AppError(ProductionErrors.RECIPE_DELETE_FAILED, 'Error al eliminar la receta.'));
    }
  },

  async getRecipes(tenantId: string, filters?: { query?: string; mode?: string; isActive?: boolean }): Promise<Result<Recipe[], AppError>> {
    try {
      const db = getDb();
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
      return failure(new AppError(ProductionErrors.RECIPES_QUERY_FAILED, 'Error al cargar recetas.'));
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
      // PLAN-115 (CODE-MIN-1): decision de diseno - getRecipeById/getRecipeWithLines son
      // lecturas. NO rechazan recetas inactivas (romperia UI de edicion: el bodeguero
      // no podria ver/activar una receta desactivada). El flag isActive viaja en el
      // Recipe retornado. Las verificaciones de "esta receta se puede usar?" ocurren
      // en expandRecipe:77-79 y createOrder:873-875, que SI rechazan con RECIPE_INACTIVE.
      return success(toRecipe(recipe as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en getRecipeById:', err);
      return failure(new AppError(ProductionErrors.RECIPE_FETCH_FAILED, 'Error al cargar la receta.'));
    }
  },

  async getRecipeWithLines(tenantId: string, recipeId: string): Promise<Result<RecipeWithLines, AppError>> {
    const db = getDb();
    // AUDIT-FLOW-7-007: Filtrar por tenantId para evitar tenant-leak (Regla #5).
    const recipe = await db.recipes
      .where({ tenantId, id: recipeId })
      .filter((r) => !r.deletedAt)
      .first();
    if (!recipe) {
      return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
    }
    // PLAN-115 (CODE-MIN-1): ver nota en getRecipeById. Lecturas no filtran por isActive.

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
    tenantId: string,
    recipeId: string,
    batchCount: number,
  ): Promise<Result<IngredientAvailability[], AppError>> {
    try {
      const db = getDb();
      const recipe = await db.recipes.get(recipeId);
      if (!recipe || recipe.deletedAt) {
        return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
      }

      // PRODUCTION-001-005: Expandir receta para resolver sub-recetas
      const expandResult = await expandRecipe(recipeId, batchCount);
      if (!expandResult.ok) return expandResult;
      const expandedLines = expandResult.data;

      const wasteMultiplier = 1 + (recipe.wastePct / 100);
      const result: IngredientAvailability[] = [];

      for (const line of expandedLines) {
        // BUGFIX-MATHCEIL-001 [Paso-1]: Convertir a storage base units (g/ml) antes del Math.ceil.
        // NOTA: product.stock siempre está en unidades base (gramos/ml), NO en kg/lt.
        const product = await db.products.where({ id: line.productId, tenantId }).first();
        const neededInStorage = product
          ? recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit)
          : line.quantity * wasteMultiplier;
        const needed = Math.ceil(neededInStorage);
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
      return failure(new AppError(ProductionErrors.AVAILABILITY_CHECK_FAILED, 'Error al verificar disponibilidad de ingredientes.'));
    }
  },

  calculateRecipeCost: calculateRecipeCostFn,

  async createOrder(
    tenantId: string,
    userId: string,
    input: CreateProductionOrderInput,
    options: { allowOverride?: boolean } = {},
  ): Promise<Result<ProductionOrder, AppError>> {
    const session = useAuthStore.getState().session;
    if (!session || !hasActionPermission(session, 'production', 'produce_batch')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }
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

    // 2. Get recipe lines (PRODUCTION-001-007: usar expandRecipe para resolver sub-recetas)
    const expandResult = await expandRecipe(input.recipeId, input.batchCount);
    if (!expandResult.ok) return expandResult;
    const expandedLines = expandResult.data;

    if (expandedLines.length === 0) {
      return failure(new AppError(ProductionErrors.RECIPE_NO_INGREDIENTS, 'La receta no tiene ingredientes.'));
    }

    // 3. Calculate quantities with waste
    const wasteMultiplier = 1 + (recipe.wastePct / 100);
    const quantityTarget = recipe.yieldQuantity * input.batchCount;

    // 4. Check ingredient availability (with override support)
    const missingIngredients: { name: string; needed: number; available: number; unit: string }[] = [];
    for (const line of expandedLines) {
      const product = await db.products.where({ id: line.productId, tenantId }).first();
      const neededInStorage = product
        ? recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit)
        : line.quantity * wasteMultiplier;
      const needed = Math.ceil(neededInStorage);
      if (!product || product.stock < needed) {
        if (options.allowOverride) {
          missingIngredients.push({
            name: product?.name || 'Desconocido',
            needed,
            available: product?.stock || 0,
            unit: product?.unit || '',
          });
          continue;
        }
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

    // 5. Calculate cost of ingredients consumed (with override support)
    let totalIngredientCost = 0;
    for (const line of expandedLines) {
      const product = await db.products.where({ id: line.productId, tenantId }).first();
      const neededInStorage = product
        ? recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit)
        : line.quantity * wasteMultiplier;
      const needed = Math.ceil(neededInStorage);
      const costOptions = { allowOverride: options.allowOverride };
      const result = await calculateConsumptionCost(line.productId, needed, costOptions);
      if (!result.ok) return failure(result.error);
      totalIngredientCost += result.data.totalCost;
    }
    // PLAN-115 (CODE-MED-21): unificar WAC rounding a preciseRound(..., 4) (Regla de Oro #6).
    // Antes: Math.round(*100)/100 (2 decimales) generaba drift vs cancelOrder que usa 4.
    // createOrder persiste costPerProducedUnit, que se usa como costUsdPerUnit del lote
    // creado. Si 2 decimales, lotes viejos pueden tener 19.99 y nuevos 20.0000.
    const costPerProducedUnit = quantityTarget > 0
      ? preciseRound(totalIngredientCost / quantityTarget, 4)
      : 0;

    // 6. Atomic transaction
    // Re-validate stock right before transaction (concurrency guard)
    for (const line of expandedLines) {
      const freshProduct = await db.products.where({ id: line.productId, tenantId }).first();
      const neededInStorage = freshProduct
        ? recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, freshProduct.unit)
        : line.quantity * wasteMultiplier;
      const needed = Math.ceil(neededInStorage);
      if (!freshProduct || freshProduct.stock < needed) {
        if (!options.allowOverride) {
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
      ], async (tx) => {
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
          totalCost: preciseRound(totalIngredientCost, 2),
          costPerUnit: costPerProducedUnit,
        };
        await db.productionOrders.add(order);
        await syncQueue.enqueue('production_orders', 'CREATE', orderId, toSnake(order as unknown as Record<string, unknown>), tenantId);

        // b. Consume ingredients (PRODUCTION-001-007: usa expandedLines para sub-recetas)
        for (const line of expandedLines) {
          const product = await db.products.where({ id: line.productId, tenantId }).first();
          if (!product) throw new AppError(ProductionErrors.RECIPE_INGREDIENT_NOT_FOUND, 'Ingrediente no encontrado.');

          const neededInStorage = recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit);
          const needed = Math.ceil(neededInStorage);

          const previousStock = product.stock;
          let actualConsumed = needed;
          let newStock: number;

          if (options.allowOverride && previousStock < needed) {
            actualConsumed = previousStock;
            newStock = 0;
          } else {
            newStock = previousStock - needed;
          }

          await db.products.update(line.productId, { stock: newStock });
          await syncQueue.enqueue('products', 'UPDATE', line.productId, toSnake({ ...product, stock: newStock } as unknown as Record<string, unknown>), tenantId);

          // Consume FIFO lots (with override support)
          const fifoResult = await consumeFifoInternal(line.productId, actualConsumed, tenantId);
          if (!fifoResult.ok) throw fifoResult.error;

          // AUDIT-FLOW-11-011A: Calcular costUsd del movement desde FIFO consumido.
          const costUsd = preciseRound(
            fifoResult.data.reduce((sum, l) => sum + l.quantity * (l.costUsdPerUnit ?? 0), 0),
            2,
          );

          // Create inventory movement
          const movementId = generateId();
          const movement = {
            id: movementId,
            tenantId,
            productId: line.productId,
            userId,
            type: 'adjustment' as const,
            quantity: -actualConsumed,
            previousStock,
            newStock,
            reasonType: options.allowOverride && previousStock < needed ? 'ajuste_manual' : 'consumo_interno',
            costUsd,
            createdAt: now,
            productionOrderId: orderId,
            consumedLots: JSON.stringify(fifoResult.data),
          };
          await db.inventoryMovements.add(movement);
          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
        }

        // c. Get finished product info
        const finishedProduct = await db.products.where({ id: recipe.productId, tenantId }).first();
        if (finishedProduct) {
          // FUGA-2: Convertir quantityTarget (display units) a storage units
          const storageType = unitToStorageType(finishedProduct.isWeighted, finishedProduct.unit);
          const quantityTargetInStorage = convertToStorage(quantityTarget, storageType);
          const costPerStorageUnit = quantityTargetInStorage > 0
            ? preciseRound(totalIngredientCost / quantityTargetInStorage, 6)
            : 0;

          // d. Create finished product lot
          const finishedLotId = generateId();
          const finishedMovementId = generateId();
          const finishedLot = {
            id: finishedLotId,
            tenantId,
            productId: recipe.productId,
            quantityAdded: quantityTargetInStorage,
            remainingQuantity: quantityTargetInStorage,
            costUsdPerUnit: costPerStorageUnit,
            sourceMovementId: finishedMovementId,
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          await db.inventoryLots.add(finishedLot);
          await syncQueue.enqueue('inventory_lots', 'CREATE', finishedLotId, toSnake(finishedLot as unknown as Record<string, unknown>), tenantId);

          // e. Update finished product stock + WAC
          // Nota: costPrice se almacena en $/display-unit (ej: $/kg para pesables).
          // El stock en storage units (g) necesita dividir costPrice entre 1000 para
          // obtener $/g. newWac se calcula en $/g y luego se multiplica ×1000 para
          // almacenar en formato $/display-unit (consistente con stockService.adjustStock).
          const prevStock = finishedProduct.stock ?? 0;
          const prevCostPriceStorage = finishedProduct.isWeighted
            ? (finishedProduct.costPrice ?? 0) / 1000
            : (finishedProduct.costPrice ?? 0);
          const newStock = prevStock + quantityTargetInStorage;
          const newValue = quantityTargetInStorage * costPerStorageUnit;
          const previousValue = prevStock * prevCostPriceStorage;
          const newWacStorage = newStock > 0
            ? preciseRound((previousValue + newValue) / newStock, 6)
            : 0;
          const newWac = finishedProduct.isWeighted
            ? preciseRound(newWacStorage * 1000, 4)
            : newWacStorage;
          await db.products.update(recipe.productId, { stock: newStock, costPrice: newWac });
          await syncQueue.enqueue('products', 'UPDATE', recipe.productId, toSnake({ ...finishedProduct, stock: newStock, costPrice: newWac } as unknown as Record<string, unknown>), tenantId);

          // f. Create movement for finished product
          const finishedMovement = {
            id: finishedMovementId,
            tenantId,
            productId: recipe.productId,
            userId,
            type: 'production_output' as const,
            quantity: quantityTargetInStorage,
            previousStock: prevStock,
            newStock,
            productionOrderId: orderId,
            createdAt: now,
          };
          await db.inventoryMovements.add(finishedMovement);
          await syncQueue.enqueue('inventory_movements', 'CREATE', finishedMovementId, toSnake(finishedMovement as unknown as Record<string, unknown>), tenantId);
        }

        // d. Outbox event
        await ev.enqueueInTransaction(tx);
      });

      // 7. Audit event
      await ev.auditAfterTransaction();

      return success(toProductionOrder({
        id: orderId, tenantId, recipeId: input.recipeId, productId: recipe.productId,
        batchCount: input.batchCount, quantityTarget, quantityProduced: 0,
        status: 'confirmed', plannedDate: input.plannedDate, createdBy: userId,
        createdAt: now, updatedAt: now,
        totalCost: preciseRound(totalIngredientCost, 2),
        costPerUnit: costPerProducedUnit,
      } as unknown as Record<string, unknown>));
    } catch (err) {
      if (err instanceof AppError) return failure(err);
      logger.error(PRODUCTION_MODULE, 'Error en createOrder:', err);
      return failure(new AppError(ProductionErrors.ORDER_CREATE_FAILED, 'Error al crear la orden de producción.'));
    }
  },

  async cancelOrder(orderId: string, tenantId: string): Promise<Result<void, AppError>> {
    const session = useAuthStore.getState().session;
    if (!session || !hasActionPermission(session, 'production', 'update')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    // AUDIT-FLOW-8-008: Filtrar por tenantId para evitar tenant-leak (Regla #5).
    const order = await db.productionOrders
      .where({ tenantId, id: orderId })
      .filter((o) => !o.deletedAt)
      .first();
    if (!order) {
      return failure(new AppError(ProductionErrors.ORDER_NOT_FOUND, 'Orden de producción no encontrada.'));
    }
    const now = new Date().toISOString();

    try {
      const ev = emitWithPersistence('PRODUCTION.ORDER_CANCELLED', PRODUCTION_MODULE, { orderId }, { userId: session?.userId, tenantId });
      await db.transaction('rw', [
        db.productionOrders, db.products, db.inventoryMovements,
        db.inventoryLots, db.recipes, db.recipeLines,
        db.syncQueue, db.outbox,
      ], async (tx) => {
        // C4: Verificar status dentro de la transacción
        const currentOrder = await db.productionOrders.get(orderId);
        if (!currentOrder || currentOrder.status !== 'confirmed') {
          throw new AppError(ProductionErrors.ORDER_INVALID_STATUS, 'La orden ya no está en estado confirmado.');
        }

        // FUGA-3: Revert ingredient con productionOrderId
        const ingredientMovements = await db.inventoryMovements
          .filter((m) => m.productionOrderId === orderId && m.type === 'adjustment' && m.reasonType === 'consumo_interno')
          .toArray();

        if (ingredientMovements.length > 0) {
          for (const movement of ingredientMovements) {
            const product = await db.products.where({ id: movement.productId, tenantId }).first();
            if (!product) continue;

            const revertQty = Math.abs(movement.quantity);
            const previousStock = product.stock;
            const newStock = previousStock + revertQty;
            await db.products.update(movement.productId, { stock: newStock });
            await syncQueue.enqueue('products', 'UPDATE', movement.productId, toSnake({ ...product, stock: newStock } as unknown as Record<string, unknown>), tenantId);

            if (movement.consumedLots) {
              const consumedLots: Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }> = JSON.parse(movement.consumedLots);
              for (const cl of consumedLots) {
                const lot = await db.inventoryLots.get(cl.lotId);
                if (lot && !lot.deletedAt) {
                  const newRemaining = (lot.remainingQuantity ?? 0) + cl.quantity;
                  const newVersion = (lot.version ?? 0) + 1;
                  await db.inventoryLots.update(cl.lotId, { remainingQuantity: newRemaining, version: newVersion });
                  await syncQueue.enqueue('inventory_lots', 'UPDATE', cl.lotId, toSnake({
                    ...lot, remainingQuantity: newRemaining, version: newVersion,
                  } as unknown as Record<string, unknown>), tenantId);
                }
              }
            }

            const revertMovementId = generateId();
            const revertMovement = {
              id: revertMovementId,
              tenantId,
              productId: movement.productId,
              userId: order.createdBy,
              type: 'adjustment' as const,
              quantity: revertQty,
              previousStock,
              newStock,
              reasonType: 'ajuste_manual',
              createdAt: now,
              productionOrderId: orderId, // FUGA-3
            };
            await db.inventoryMovements.add(revertMovement);
            await syncQueue.enqueue('inventory_movements', 'CREATE', revertMovementId, toSnake(revertMovement as unknown as Record<string, unknown>), tenantId);
          }
        } else {
          const recipe = await db.recipes.get(order.recipeId);
          if (recipe) {
            const expandResult = await expandRecipe(order.recipeId, order.batchCount);
            if (expandResult.ok) {
              const wasteMultiplier = 1 + (recipe.wastePct / 100);
              for (const line of expandResult.data) {
                const product = await db.products.where({ id: line.productId, tenantId }).first();
                if (!product) continue;
                const neededInStorage = recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit);
                const needed = Math.ceil(neededInStorage);
                const previousStock = product.stock;
                const newStock = previousStock + needed;
                await db.products.update(line.productId, { stock: newStock });
                await syncQueue.enqueue('products', 'UPDATE', line.productId, toSnake({ ...product, stock: newStock } as unknown as Record<string, unknown>), tenantId);

                const revertMovementId = generateId();
                const revertMovement = {
                  id: revertMovementId,
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
                await db.inventoryMovements.add(revertMovement);
                await syncQueue.enqueue('inventory_movements', 'CREATE', revertMovementId, toSnake(revertMovement as unknown as Record<string, unknown>), tenantId);
              }
            }
          }
        }

        // Revert finished product stock if it was produced
        const finishedProduct = await db.products.where({ id: order.productId, tenantId }).first();
        if (finishedProduct && order.quantityTarget > 0) {
          // FUGA-2: Convertir order.quantityTarget (display units) a storage units antes de revertir
          const storageType = unitToStorageType(finishedProduct.isWeighted, finishedProduct.unit);
          const quantityTargetInStorage = convertToStorage(order.quantityTarget, storageType);
          const previousStock = finishedProduct.stock;
          // DINERO-013 (M3): revertir solo el stock que aún existe (no las unidades ya vendidas).
          // quantityToRevert = min(stock actual, quantityTargetInStorage). Nunca resta de más.
          const quantityToRevert = Math.min(previousStock, quantityTargetInStorage);
          const newStock = Math.max(0, previousStock - quantityToRevert);
          await db.products.update(order.productId, { stock: newStock });
          await syncQueue.enqueue('products', 'UPDATE', order.productId, toSnake({ ...finishedProduct, stock: newStock } as unknown as Record<string, unknown>), tenantId);

          const movementId = generateId();
          const movement = {
            id: movementId,
            tenantId,
            productId: order.productId,
            userId: order.createdBy,
            type: 'adjustment' as const,
            quantity: -quantityToRevert,
            previousStock,
            newStock,
            reasonType: 'ajuste_manual',
            createdAt: now,
          };
          await db.inventoryMovements.add(movement);
          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
        }

        // C4: Revert finished product lot — buscar por FK productionOrderId en vez de ventana temporal
        const prodMovement = await db.inventoryMovements
          .where({ productionOrderId: orderId })
          .filter((m) => m.type === 'production_output')
          .first();
        let lotToRevert: DexieInventoryLot | undefined;
        if (prodMovement) {
          const lots = await db.inventoryLots
            .where({ productId: order.productId })
            .filter((l) => l.sourceMovementId === prodMovement.id && !l.deletedAt)
            .toArray();
          lotToRevert = lots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        }
        // Fallback legacy: ventana temporal para órdenes pre-FK
        if (!lotToRevert) {
          const finishedLots = await db.inventoryLots
            .where({ productId: order.productId })
            .filter((l) => !l.deletedAt && l.createdAt >= order.createdAt && l.createdAt <= now)
            .toArray();
          lotToRevert = finishedLots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        }
        if (lotToRevert && lotToRevert.remainingQuantity === lotToRevert.quantityAdded) {
          await db.inventoryLots.update(lotToRevert.id, { deletedAt: now, remainingQuantity: 0 });
          await syncQueue.enqueue('inventory_lots', 'UPDATE', lotToRevert.id, { id: lotToRevert.id, deleted_at: now, remaining_quantity: 0 }, tenantId);
        }

        // PLAN-115 (CODE-MED-22): recalcular WAC del producto terminado SIEMPRE despues
        // de revertir, no solo si el lote estaba intacto. Si el lote fue parcialmente
        // vendido (remainingQuantity < quantityAdded), el bloque se saltaba y WAC quedaba
        // desactualizado. Ahora el calculo ocurre siempre, leyendo remainingLots tras la
        // posible baja del lote revertido.
        {
          const remainingLots = await db.inventoryLots
            .where({ productId: order.productId })
            .filter((l) => !l.deletedAt)
            .toArray();
          let totalCost = 0;
          let totalQty = 0;
          for (const lot of remainingLots) {
            totalCost += (lot.costUsdPerUnit ?? 0) * lot.remainingQuantity;
            totalQty += lot.remainingQuantity;
          }
          const newCostPrice = totalQty > 0
            ? preciseRound(totalCost / totalQty, 4)
            : 0;
          const productForWac = await db.products.where({ id: order.productId, tenantId }).first();
          if (productForWac && productForWac.costPrice !== newCostPrice) {
            await db.products.update(order.productId, { costPrice: newCostPrice });
            await syncQueue.enqueue('products', 'UPDATE', order.productId, toSnake({ ...productForWac, costPrice: newCostPrice } as unknown as Record<string, unknown>), tenantId);
          }
        }

        // Update order status
        await db.productionOrders.update(orderId, { status: 'cancelled', updatedAt: now });
        await syncQueue.enqueue('production_orders', 'UPDATE', orderId, { id: orderId, status: 'cancelled', updated_at: now }, tenantId);
        await ev.enqueueInTransaction(tx);
      });

      await ev.auditAfterTransaction();
      return success(undefined);
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en cancelOrder:', err);
      return failure(new AppError(ProductionErrors.ORDER_CANCEL_FAILED, 'Error al cancelar la orden.'));
    }
  },

  async getOrders(
    tenantId: string,
    filters?: { status?: string; recipeId?: string },
  ): Promise<Result<ProductionOrder[], AppError>> {
    try {
      const db = getDb();
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
      return failure(new AppError(ProductionErrors.ORDERS_QUERY_FAILED, 'Error al cargar órdenes de producción.'));
    }
  },

  /**
   * Consume ingredientes para un producto de ensamblaje (combo).
   *
   * PLAN-115 (CODE-MED-7): CONTRATO IMPORTANTE — esta funcion NO abre su propia
   * transaccion Dexie. El CALLER es responsable de estar dentro de una tx. Patron
   * fragil por diseno: posService.createSale abre tx y nos invoca dentro. Si se
   * agrega un nuevo caller que no abra tx, las mutaciones (products.update,
   * inventoryLots.update, inventoryMovements.add) quedaran sin rollback atomico.
   *
   * Antes de agregar otro caller:
   *   1. Envolver la llamada en db.transaction('rw', [tablas necesarias], ...)
   *   2. O refactorizar esta funcion para auto-abrir tx (preferible si se vuelve
   *      a usar fuera de createSale).
   */
  async consumeForAssembly(
    productId: string,
    quantity: number,
    tenantId: string,
    userId: string,
    options: { allowOverride?: boolean } = {},
    tx?: Transaction,
  ): Promise<Result<{ consumedLots: Array<{ lotId: string; quantity: number }>; totalIngredientCost: number }, AppError>> {
    const _consumeSession = useAuthStore.getState().session;
    if (!_consumeSession || !hasActionPermission(_consumeSession, 'production', 'produce_batch')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
    }
    const db = getDb();
    const now = new Date().toISOString();

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return failure(new AppError(ProductionErrors.ASSEMBLY_INVALID_QUANTITY, 'La cantidad de ensamblaje debe ser mayor a cero.'));
    }

    const recipe = await db.recipes
      .where({ productId, mode: 'assembly' as const })
      .filter(r => !r.deletedAt && r.isActive)
      .first();

    if (!recipe) {
      return failure(new AppError(ProductionErrors.ASSEMBLY_NO_RECIPE, `Producto no tiene receta de ensamblaje.`));
    }

    const expandResult = await expandRecipe(recipe.id, quantity);
    if (!expandResult.ok) return expandResult;
    const expandedLines = expandResult.data;

    if (expandedLines.length === 0) {
      return failure(new AppError(ProductionErrors.RECIPE_NO_INGREDIENTS, `La receta de ensamblaje no tiene ingredientes.`));
    }

    const wasteMultiplier = 1 + (recipe.wastePct / 100);
    let totalIngredientCost = 0;
    const assemblyConsumedLots: Array<{ lotId: string; quantity: number }> = [];

    const doWrites = async (): Promise<void> => {
      for (const line of expandedLines) {
        const ingredient = await db.products.where({ id: line.productId, tenantId }).first();
        if (!ingredient) {
          throw new AppError(ProductionErrors.RECIPE_INGREDIENT_NOT_FOUND, 'Ingrediente no encontrado.');
        }

        const neededInStorage = recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, ingredient.unit);
        const needed = Math.ceil(neededInStorage);

        const calcResult = await calculateConsumptionCost(line.productId, needed, { allowOverride: options.allowOverride });
        if (!calcResult.ok) throw calcResult.error;
        const { totalCost: lineTotalCost } = calcResult.data;

        const isInsufficient = ingredient.stock < needed;
        const previousStock = ingredient.stock;
        let newStock: number;
        if (previousStock < needed) {
          if (options.allowOverride) {
            newStock = 0;
          } else {
            throw new AppError(ProductionErrors.ASSEMBLY_INSUFFICIENT_STOCK, `Stock insuficiente para ingrediente. Necesario: ${needed}, disponible: ${previousStock}.`);
          }
        } else {
          newStock = previousStock - needed;
        }

        await db.products.update(line.productId, { stock: newStock });
        await syncQueue.enqueue('products', 'UPDATE', line.productId, toSnake({ ...ingredient, stock: newStock } as unknown as Record<string, unknown>), tenantId);

        const fifoResult = await consumeFifoInternal(line.productId, needed, tenantId);
        if (!fifoResult.ok) throw fifoResult.error;
        for (const cl of fifoResult.data) {
          assemblyConsumedLots.push({ lotId: cl.lotId, quantity: cl.quantity });
        }

        totalIngredientCost += lineTotalCost;
        const movementCostUsd = preciseRound(lineTotalCost, 2);
        const movementId = generateId();
        const reasonType = isInsufficient ? 'ajuste_manual' : 'consumo_interno';

        await db.inventoryMovements.add({
          id: movementId, tenantId, productId: line.productId, userId,
          type: 'adjustment' as const, quantity: -needed, previousStock, newStock,
          reasonType, costUsd: movementCostUsd, createdAt: now,
        });
        await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake({
          id: movementId, tenantId, productId: line.productId, userId,
          type: 'adjustment', quantity: -needed, previousStock, newStock,
          reasonType, costUsd: movementCostUsd, createdAt: now,
        } as unknown as Record<string, unknown>), tenantId);
      }

      const comboLotId = generateId();
      const comboLot = {
        id: comboLotId, tenantId, productId,
        quantityAdded: quantity, remainingQuantity: quantity,
        costUsdPerUnit: preciseRound(totalIngredientCost / quantity, 4),
        createdAt: now, updatedAt: now, version: 1,
      };
      await db.inventoryLots.add(comboLot);
      await syncQueue.enqueue('inventory_lots', 'CREATE', comboLotId, toSnake(comboLot as unknown as Record<string, unknown>), tenantId);
    };

    try {
      if (tx) {
        await doWrites();
      } else {
        await db.transaction('rw', [db.products, db.inventoryLots, db.inventoryMovements, db.syncQueue], async () => {
          await doWrites();
        });
      }
    } catch (err) {
      if (err instanceof AppError) return failure(err);
      throw err;
    }

    await emitWithAudit({
      eventName: 'PRODUCTION.ASSEMBLY_CONSUMED',
      module: PRODUCTION_MODULE,
      payload: { productId, quantity, tenantId },
      context: { userId, tenantId },
    });

    return success({ consumedLots: assemblyConsumedLots, totalIngredientCost });
  },

  // ===== ORDER DETAILS =====

  async getOrderDetails(
    tenantId: string,
    orderId: string,
  ): Promise<Result<{
    order: ProductionOrder;
    recipe: Recipe;
    lines: RecipeLine[];
    ingredientCosts: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unit: string;
      costPerUnit: number;
      totalCost: number;
    }>;
    totalCost: number;
    costPerUnit: number;
  }, AppError>> {
    try {
      const db = getDb();

      const order = await db.productionOrders
        .where({ tenantId, id: orderId })
        .filter((o) => !o.deletedAt)
        .first();
      if (!order) {
        return failure(new AppError(ProductionErrors.ORDER_NOT_FOUND, 'Orden de producción no encontrada.'));
      }

      const recipe = await db.recipes.get(order.recipeId);
      if (!recipe || recipe.deletedAt) {
        return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
      }

      // BUG-PROD-002: Use expandRecipe to resolve sub-recipes (same as createOrder)
      const expandResult = await expandRecipe(order.recipeId, order.batchCount);
      if (!expandResult.ok) return expandResult;
      const expandedLines = expandResult.data;

      // Fetch inventory movements for this order to get real FIFO costs
      // We need the raw movements with costUsd field
      let movements = await db.inventoryMovements
        .where({ productionOrderId: orderId })
        .toArray();

      // Fallback: if no movements with FK, use temporal window (legacy orders)
      if (movements.length === 0) {
        const orderDate = order.createdAt;
        const startDate = new Date(new Date(orderDate).getTime() - 60000).toISOString();
        const endDate = new Date(new Date(orderDate).getTime() + 60000).toISOString();

        movements = await db.inventoryMovements
          .where({ tenantId })
          .filter((m) => {
            if (m.createdAt < startDate || m.createdAt > endDate) return false;
            if (m.productId === order.productId && m.type === 'production_output') return true;
            if (m.type === 'adjustment' && m.reasonType === 'consumo_interno') return true;
            return false;
          })
          .toArray();
      }

      // Build map of actual FIFO cost per productId from 'consumo_interno' movements
      // These movements have the real costUsd from FIFO lot consumption
      const actualCostMap = new Map<string, { totalCostUsd: number; totalQty: number }>();
      for (const m of movements) {
        if (m.type === 'adjustment' && m.reasonType === 'consumo_interno' && m.costUsd != null && m.quantity !== 0) {
          const key = m.productId;
          const existing = actualCostMap.get(key) || { totalCostUsd: 0, totalQty: 0 };
          existing.totalCostUsd += m.costUsd;
          existing.totalQty += Math.abs(m.quantity); // quantity is negative for consumption
          actualCostMap.set(key, existing);
        }
      }

      const wasteMultiplier = 1 + (recipe.wastePct / 100);
      const ingredientCosts: Array<{
        productId: string;
        productName: string;
        quantity: number;
        unit: string;
        costPerUnit: number;
        totalCost: number;
      }> = [];

      let totalCost = 0;

      for (const line of expandedLines) {
        const product = await db.products.where({ id: line.productId, tenantId }).first();
        const productName = product?.name || 'Desconocido';
        // expandedLines already have batchCount multiplied; apply wasteMultiplier
        const neededInStorage = product
          ? recipeQtyToStorageBase(line.quantity * wasteMultiplier, line.unit, product.unit)
          : line.quantity * wasteMultiplier;
        const needed = Math.ceil(neededInStorage);
        // BUG-PROD-006: Display quantity in product's native unit (e.g., 0.5 kg not 500 g)
        const displayQty = product
          ? recipeQtyToStorage(line.quantity * wasteMultiplier, line.unit, product.unit)
          : line.quantity * wasteMultiplier;
        const displayUnit = product?.unit || line.unit;

        // Use actual FIFO cost from inventory movements if available, otherwise fall back to WAC
        let costPerStorageUnit: number;
        const actualCostData = actualCostMap.get(line.productId);
        if (actualCostData && actualCostData.totalQty > 0) {
          // Actual FIFO cost per storage unit (g or ml)
          costPerStorageUnit = actualCostData.totalCostUsd / actualCostData.totalQty;
        } else {
          // BUG-PROD-001: Pesable products store costPrice per display unit ($/kg, $/lt)
          // but needed is in storage base (g, ml). Divide by 1000 for weighted products.
          costPerStorageUnit = product && product.isWeighted
            ? (product.costPrice ?? 0) / 1000
            : (product?.costPrice ?? 0);
        }

        const lineCost = needed * costPerStorageUnit;
        totalCost += lineCost;

        ingredientCosts.push({
          productId: line.productId,
          productName,
          quantity: preciseRound(displayQty, 2),
          unit: displayUnit,
          costPerUnit: preciseRound(costPerStorageUnit, 4),
          totalCost: preciseRound(lineCost, 2),
        });
      }

      // Prefer stored FIFO costs from creation time; fall back to WAC recalculation for old orders
      const finalTotalCost = order.totalCost ?? preciseRound(totalCost, 2);
      const finalCostPerUnit = order.costPerUnit ?? (order.quantityTarget > 0
        ? preciseRound(totalCost / order.quantityTarget, 4)
        : 0);

      return success({
        order: toProductionOrder(order as unknown as Record<string, unknown>),
        recipe: toRecipe(recipe as unknown as Record<string, unknown>),
        lines: expandedLines.map((l) => ({
          id: '',
          tenantId,
          recipeId: order.recipeId,
          productId: l.productId,
          quantity: l.quantity,
          unit: l.unit,
          sortOrder: 0,
          createdAt: '',
          deletedAt: undefined,
        })),
        ingredientCosts,
        totalCost: finalTotalCost,
        costPerUnit: finalCostPerUnit,
      });
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en getOrderDetails:', err);
      return failure(new AppError(ProductionErrors.ORDERS_QUERY_FAILED, 'Error al cargar detalles de la orden.'));
    }
  },

  async getOrderInventoryMovements(
    tenantId: string,
    orderId: string,
  ): Promise<Result<Array<{
    id: string;
    productName: string;
    type: string;
    quantity: number;
    previousStock: number;
    newStock: number;
    createdAt: string;
  }>, AppError>> {
    try {
      const db = getDb();

      const order = await db.productionOrders
        .where({ tenantId, id: orderId })
        .filter((o) => !o.deletedAt)
        .first();
      if (!order) {
        return failure(new AppError(ProductionErrors.ORDER_NOT_FOUND, 'Orden de producción no encontrada.'));
      }

      // Buscar movimientos de inventario usando productionOrderId FK,
      // con fallback a ventana temporal de 60s para órdenes legacy (pre-FUGA-3)
      // MED-4: la FK es más precisa que la ventana temporal que entremezclaba órdenes cercanas
      let movements = await db.inventoryMovements
        .where({ productionOrderId: orderId })
        .toArray();

      // Fallback: si no hay movimientos con FK, usar ventana temporal (órdenes legacy)
      if (movements.length === 0) {
        const orderDate = order.createdAt;
        const startDate = new Date(new Date(orderDate).getTime() - 60000).toISOString();
        const endDate = new Date(new Date(orderDate).getTime() + 60000).toISOString();

        movements = await db.inventoryMovements
          .where({ tenantId })
          .filter((m) => {
            if (m.createdAt < startDate || m.createdAt > endDate) return false;
            if (m.productId === order.productId && m.type === 'production_output') return true;
            if (m.type === 'adjustment' && m.reasonType === 'consumo_interno') return true;
            return false;
          })
          .toArray();
      }

      const result = [];
      for (const m of movements) {
        const product = await db.products.where({ id: m.productId, tenantId }).first();
        result.push({
          id: m.id,
          productName: product?.name || 'Desconocido',
          type: m.type,
          quantity: m.quantity,
          previousStock: m.previousStock,
          newStock: m.newStock,
          createdAt: m.createdAt,
        });
      }

      return success(result);
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en getOrderInventoryMovements:', err);
      return failure(new AppError(ProductionErrors.ORDERS_QUERY_FAILED, 'Error al cargar movimientos de inventario.'));
    }
  },

  async hasOrderSales(
    tenantId: string,
    orderId: string,
  ): Promise<Result<boolean, AppError>> {
    try {
      const db = getDb();

      const order = await db.productionOrders
        .where({ tenantId, id: orderId })
        .filter((o) => !o.deletedAt)
        .first();
      if (!order) {
        return failure(new AppError(ProductionErrors.ORDER_NOT_FOUND, 'Orden de producción no encontrada.'));
      }

      // Buscar ventas del producto terminado después de la orden
      const orderDate = order.completedAt || order.createdAt;
      const sales = await db.sales
        .where({ tenantId })
        .filter((s) => !s.deletedAt && s.createdAt >= orderDate)
        .toArray();

      for (const sale of sales) {
        const items = await db.saleItems
          .where({ saleId: sale.id })
          .filter((i) => i.productId === order.productId)
          .toArray();
        if (items.length > 0) {
          return success(true);
        }
      }

      return success(false);
    } catch (err) {
      logger.error(PRODUCTION_MODULE, 'Error en hasOrderSales:', err);
      return failure(new AppError(ProductionErrors.ORDERS_QUERY_FAILED, 'Error al verificar ventas de la orden.'));
    }
  },

  // ===== INTERNAL HELPERS =====
};

async function consumeFifoInternal(
  productId: string,
  quantity: number,
  tenantId: string,
): Promise<Result<Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }>, AppError>> {
  if (!tenantId) {
    return failure(new AppError('TENANT_REQUIRED', 'No hay tenant en sesión.'));
  }
  const db = getDb();

  // 1. Obtener plan de consumo FIFO (solo lectura, lógica compartida)
  const planResult = await selectFifoLots(productId, quantity, tenantId);
  if (!planResult.ok) return planResult;
  const plan = planResult.data;

  // 2. Aplicar escrituras con optimistic locking (version check)
  const consumed: Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }> = [];

  for (const item of plan) {
    const currentLot = await db.inventoryLots.get(item.lotId);
    if (!currentLot) continue;

    // Optimistic lock: verificar que la versión no haya cambiado desde la lectura
    if ((currentLot.version ?? 0) !== item.version) {
      return failure(new AppError('INVENTORY_LOT_FIFO_CONFLICT', 'Conflicto de inventario. Reintente la operación.'));
    }

    const newRemaining = currentLot.remainingQuantity - item.quantity;
    const newVersion = (currentLot.version ?? 0) + 1;
    await db.inventoryLots.update(item.lotId, { remainingQuantity: newRemaining, version: newVersion });
    await syncQueue.enqueue('inventory_lots', 'UPDATE', item.lotId, toSnake({
      ...currentLot, remainingQuantity: newRemaining, version: newVersion,
    } as unknown as Record<string, unknown>), tenantId);

    consumed.push({ lotId: item.lotId, quantity: item.quantity, costUsdPerUnit: item.costUsdPerUnit });
  }

  return success(consumed);
}

// Re-exports for backward compatibility — all exports unchanged
export { recipeQtyToStorage, recipeQtyToStorageBase } from './productionMappers';
export { toRecipe, toRecipeLine, toProductionOrder } from './productionMappers';
export { expandRecipe, validateCycles } from './recipeGraphService';
export { computeRecipeCostFromLines } from './costService';
