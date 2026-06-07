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
import { TenantTranslator } from '../../../services/tenantTranslator';
import { getDb } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { emitWithAudit, emitWithPersistence } from '../../../services/audit/emitWithAudit';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { ProductionErrors } from '../../../specs/production/errors';
import { CreateRecipeInputSchema, UpdateRecipeInputSchema, CreateProductionOrderInputSchema, type CalculateRecipeCostResult } from '../../../specs/production';
import { logger } from '../../../lib/logger';
import { calculateConsumptionCost } from './costCalculator';
import { requireRole } from '../../auth/services/roleGuard';
import type { Recipe, RecipeLine, ProductionOrder, CreateRecipeInput, CreateProductionOrderInput, UpdateRecipeInput, RecipeWithLines, IngredientAvailability, ExpandedRecipeLine } from '../types';

/**
 * Convierte la cantidad de un ingrediente (en la unidad declarada en la receta)
 * a la unidad de almacenamiento del producto (gramos para kg, ml para lt, unidades para unidad).
 */
export function recipeQtyToStorage(qty: number, recipeUnit: string, productUnit: string): number {
  if (productUnit === 'kg' && recipeUnit === 'g') return qty;
  if (productUnit === 'kg' && recipeUnit === 'kg') return qty * 1000;
  if (productUnit === 'lt' && recipeUnit === 'ml') return qty;
  if (productUnit === 'lt' && recipeUnit === 'lt') return qty * 1000;
  if (productUnit === 'unidad' && recipeUnit === 'unidad') return qty;
  if (productUnit === 'gr' && recipeUnit === 'g') return qty;
  if (productUnit === 'm' && recipeUnit === 'ml') return qty;
  return qty;
}
import type { DexieRecipe, DexieRecipeLine, DexieProductionOrder, DexieProduct } from '../../../services/dexie/db';

const PRODUCTION_MODULE = 'PRODUCTION';

// PRODUCTION-001: Límite máximo de profundidad de recursión para sub-recetas
const MAX_RECIPE_DEPTH = 5;

// PRODUCTION-001-001: Función pura para expandir una receta en ingredientes base con DFS
export async function expandRecipe(
  recipeId: string,
  multiplier: number,
  visited: Set<string> = new Set(),
  depth: number = 1,
): Promise<Result<ExpandedRecipeLine[], AppError>> {
  if (depth > MAX_RECIPE_DEPTH) {
    return failure(new AppError(
      ProductionErrors.RECIPE_MAX_DEPTH_EXCEEDED,
      `La receta anida ${depth} niveles. Máximo permitido: ${MAX_RECIPE_DEPTH}.`,
    ));
  }

  if (visited.has(recipeId)) {
    return failure(new AppError(
      ProductionErrors.RECIPE_CYCLE_DETECTED,
      'Esta receta forma un ciclo. No se puede expandir.',
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

  for (const line of lines) {
    const product = await db.products.get(line.productId);
    if (!product || product.deletedAt) {
      return failure(new AppError(
        ProductionErrors.SUB_RECIPE_NOT_FOUND,
        `Sub-receta no encontrada para el producto: ${line.productId}`,
      ));
    }

    const isSubRecipe = product.productType === 'producto_terminado';
    let subRecipe: DexieRecipe | undefined;
    if (isSubRecipe) {
      // Buscar receta activa O inactiva para detectar ambos casos
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
      const subMultiplier = line.quantity * multiplier;
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

// PRODUCTION-001-002: Validación de ciclos con DFS pre-guardado
export async function validateCycles(
  productId: string,
  lines: Array<{ productId: string; quantity: number; unit: string }>,
): Promise<Result<true, AppError>> {
  const db = getDb();
  const visited = new Set<string>([productId]);
  const stack: Array<{ pid: string; lines: typeof lines }> = [{ pid: productId, lines }];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.lines.length === 0) continue;

    for (const line of current.lines) {
      if (visited.has(line.productId)) {
        return failure(new AppError(
          ProductionErrors.RECIPE_CYCLE_DETECTED,
          `No se puede guardar: la receta forma un ciclo. "${line.productId}" ya fue visitado.`,
        ));
      }

      const subRecipe = await db.recipes
        .where({ productId: line.productId })
        .filter((r) => !r.deletedAt && r.isActive)
        .first();

      if (subRecipe) {
        visited.add(line.productId);
        const subLines = await db.recipeLines
          .where({ recipeId: subRecipe.id })
          .filter((l) => !l.deletedAt)
          .toArray();
        const nextLines = subLines.map((l) => ({ productId: l.productId, quantity: l.quantity, unit: l.unit }));
        stack.push({ pid: line.productId, lines: nextLines });
      }
    }
  }

  return success(true);
}

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
    requireRole('owner', 'admin');
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
      if (input.newProductPriceUsd == null) {
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
      .where({ tenantId, name: input.name })
      .filter((r) => !r.deletedAt)
      .first();
    if (existingName) {
      return failure(new AppError(ProductionErrors.RECIPE_DUPLICATE_NAME, 'Ya existe una receta con ese nombre.'));
    }

    // Check duplicate recipe batch for same product
    if (input.mode === 'batch' && resolvedProductId) {
      const existing = await db.recipes
        .where({ tenantId, productId: resolvedProductId, mode: 'batch' })
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
      const needed = recipeQtyToStorage(line.quantity, line.unit, ingredient.unit);
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
            newProductRecord = {
              id: createdProductId,
              tenantId,
              name: input.newProductName!,
              sku: input.newProductSku!,
              priceUsd: input.newProductPriceUsd!,
              categoryId: input.newProductCategoryId,
              isWeighted: false,
              isTaxable: true,
              isSellable: true,
              unit: 'unidad',
              stock: 0,
              costPrice: 0,
              productType: 'producto_terminado',
            };
            await db.products.add(newProductRecord);
            await syncQueue.enqueue('products', 'CREATE', createdProductId, toSnake(newProductRecord as unknown as Record<string, unknown>), tenantId);
            resolvedProductId = createdProductId;

            // Outbox: producto creado desde producción
            await evRecipe.enqueueInTransaction(tx); // placeholder — emitimos ambos en mismo helper abajo
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
      logger.error(PRODUCTION_MODULE, 'Error en createRecipe:', err);
      return failure(new AppError(ProductionErrors.RECIPE_CREATE_FAILED, 'Error al crear la receta.'));
    }
  },

  async updateRecipe(
    id: string,
    input: UpdateRecipeInput,
    tenantId: string,
  ): Promise<Result<Recipe, AppError>> {
    requireRole('owner', 'admin');
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

    // DINERO-011 (M1): validar ciclos en updateRecipe
    if (input.lines) {
      const cycleCheck = await validateCycles(
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
      const ev = emitWithPersistence('PRODUCTION.UPDATED', PRODUCTION_MODULE, { recipeId: id, changes: Object.keys(input) }, { userId: undefined, tenantId });
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
    requireRole('owner', 'admin');
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

      // PRODUCTION-001-005: Expandir receta para resolver sub-recetas
      const expandResult = await expandRecipe(recipeId, batchCount);
      if (!expandResult.ok) return expandResult;
      const expandedLines = expandResult.data;

      const wasteMultiplier = 1 + (recipe.wastePct / 100);
      const result: IngredientAvailability[] = [];

      for (const line of expandedLines) {
        // BUGFIX-MATHCEIL-001 [Paso-1]: Convertir a storage units antes del Math.ceil para no inflar fracciones.
        const product = await db.products.get(line.productId);
        const neededInStorage = product
          ? recipeQtyToStorage(line.quantity * wasteMultiplier, line.unit, product.unit)
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
      return failure(new AppError('PRODUCTION_AVAILABILITY_CHECK_FAILED', 'Error al verificar disponibilidad de ingredientes.'));
    }
  },

  async calculateRecipeCost(
    recipeId: string,
    batchCount: number,
  ): Promise<Result<CalculateRecipeCostResult, AppError>> {
    try {
      const db = getDb();
      const recipe = await db.recipes.get(recipeId);
      if (!recipe || recipe.deletedAt) {
        return failure(new AppError(ProductionErrors.RECIPE_NOT_FOUND, 'Receta no encontrada.'));
      }

      // PRODUCTION-001-004: Expandir receta para resolver sub-recetas
      const expandResult = await expandRecipe(recipeId, batchCount);
      if (!expandResult.ok) return expandResult;
      const expandedLines = expandResult.data;

      if (expandedLines.length === 0) {
        return failure(new AppError(ProductionErrors.RECIPE_NO_INGREDIENTS, 'La receta no tiene ingredientes para calcular costo.'));
      }

      const wasteMultiplier = 1 + (recipe.wastePct / 100);
      let totalCost = 0;
      // PRODUCTION-003 [Paso-5]: acumular warnings de ingredientes sin costo registrado.
      // Evitamos duplicados via Set para casos donde una sub-receta repita el mismo ingrediente.
      const warningsSet = new Set<string>();

      for (const line of expandedLines) {
        const product = await db.products.get(line.productId);
        // BUGFIX-MATHCEIL-001 [Paso-2]: Usar recipeQtyToStorage para que calculateRecipeCost
        // reporte la misma cantidad en storage units (g/ml) que createOrder consume.
        const neededInStorage = product
          ? recipeQtyToStorage(line.quantity * wasteMultiplier, line.unit, product.unit)
          : line.quantity * wasteMultiplier;
        if (product && product.costPrice != null && product.costPrice > 0) {
          // El costPrice del producto está en $/display_unit (kg/lt/unidad).
          // Para pesables, dividir entre 1000 para obtener $/g o $/ml (storage unit).
          const costPerStorageUnit = product.isWeighted
            ? product.costPrice / 1000
            : product.costPrice;
          totalCost += neededInStorage * costPerStorageUnit;
        } else if (product) {
          // PRODUCTION-003 [Paso-5]: ingrediente sin costo -> warning no bloqueante.
          warningsSet.add(`${product.name} no tiene costo registrado`);
        }
      }

      return success({
        totalCost: preciseRound(totalCost, 2),
        warnings: Array.from(warningsSet),
      });
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
    requireRole('owner', 'admin');
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

    // 4. Check ingredient availability
    for (const line of expandedLines) {
      // BUGFIX-MATHCEIL-001 [Paso-1]: Convertir a storage units antes del Math.ceil para no inflar fracciones.
      const product = await db.products.get(line.productId);
      const neededInStorage = product
        ? recipeQtyToStorage(line.quantity * wasteMultiplier, line.unit, product.unit)
        : line.quantity * wasteMultiplier;
      const needed = Math.ceil(neededInStorage);
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
    // PRODUCTION-003 [Paso-3]: Reemplazado cálculo manual con helper FIFO real.
    let totalIngredientCost = 0;
    for (const line of expandedLines) {
      // BUGFIX-MATHCEIL-001 [Paso-1]: Pasar cantidad en storage units al helper FIFO.
      const product = await db.products.get(line.productId);
      const neededInStorage = product
        ? recipeQtyToStorage(line.quantity * wasteMultiplier, line.unit, product.unit)
        : line.quantity * wasteMultiplier;
      const needed = Math.ceil(neededInStorage);
      const result = await calculateConsumptionCost(line.productId, needed);
      if (!result.ok) return failure(result.error);
      totalIngredientCost += result.data.totalCost;
    }
    const costPerProducedUnit = quantityTarget > 0
      ? Math.round((totalIngredientCost / quantityTarget) * 100) / 100
      : 0;

    // 6. Atomic transaction
    // Re-validate stock right before transaction (concurrency guard)
    for (const line of expandedLines) {
      // BUGFIX-MATHCEIL-001 [Paso-1]: Convertir a storage units antes del Math.ceil para no inflar fracciones.
      const freshProduct = await db.products.get(line.productId);
      const neededInStorage = freshProduct
        ? recipeQtyToStorage(line.quantity * wasteMultiplier, line.unit, freshProduct.unit)
        : line.quantity * wasteMultiplier;
      const needed = Math.ceil(neededInStorage);
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
        };
        await db.productionOrders.add(order);
        await syncQueue.enqueue('production_orders', 'CREATE', orderId, toSnake(order as unknown as Record<string, unknown>), tenantId);

        // b. Consume ingredients (PRODUCTION-001-007: usa expandedLines para sub-recetas)
        for (const line of expandedLines) {
          const product = await db.products.get(line.productId);
          if (!product) throw new AppError(ProductionErrors.RECIPE_INGREDIENT_NOT_FOUND, 'Ingrediente no encontrado.');

          // BUGFIX-MATHCEIL-001 [Paso-1]: Convertir a storage units antes del Math.ceil para no inflar fracciones.
          const neededInStorage = recipeQtyToStorage(line.quantity * wasteMultiplier, line.unit, product.unit);
          const needed = Math.ceil(neededInStorage);

          const previousStock = product.stock;
          const newStock = previousStock - needed;

          await db.products.update(line.productId, { stock: newStock });
          await syncQueue.enqueue('products', 'UPDATE', line.productId, toSnake({ ...product, stock: newStock } as unknown as Record<string, unknown>), tenantId);

          // Consume FIFO lots
          const fifoResult = await consumeFifoInternal(line.productId, needed, tenantId);
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
            quantity: -needed,
            previousStock,
            newStock,
            reasonType: 'consumo_interno',
            costUsd,
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
          version: 1,
        };
        await db.inventoryLots.add(finishedLot);
        await syncQueue.enqueue('inventory_lots', 'CREATE', finishedLotId, toSnake(finishedLot as unknown as Record<string, unknown>), tenantId);

        // Update finished product stock + WAC
        // PRODUCTION-003 [Paso-4]: Sincronizar product.costPrice con WAC tras producir.
        // Consistente con receiveOrder en Compras (purchaseService.ts:583-601).
        const finishedProduct = await db.products.get(recipe.productId);
        if (finishedProduct) {
          const prevStock = finishedProduct.stock ?? 0;
          const prevCostPrice = finishedProduct.costPrice ?? 0;
          const newStock = prevStock + quantityTarget;
          const previousValue = prevStock * prevCostPrice;
          const newValue = quantityTarget * costPerProducedUnit;
          const newWac = newStock > 0
            ? Math.round(((previousValue + newValue) / newStock) * 100) / 100
            : 0;
          await db.products.update(recipe.productId, { stock: newStock, costPrice: newWac });
          await syncQueue.enqueue('products', 'UPDATE', recipe.productId, toSnake({ ...finishedProduct, stock: newStock, costPrice: newWac } as unknown as Record<string, unknown>), tenantId);

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
        await ev.enqueueInTransaction(tx);
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
    requireRole('owner', 'admin');
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
    if (order.status !== 'confirmed') {
      return failure(new AppError(ProductionErrors.ORDER_INVALID_STATUS, 'Solo se pueden cancelar órdenes confirmadas.'));
    }

    const now = new Date().toISOString();

    try {
      const ev = emitWithPersistence('PRODUCTION.ORDER_CANCELLED', PRODUCTION_MODULE, { orderId }, { userId: undefined, tenantId });
      await db.transaction('rw', [
        db.productionOrders, db.products, db.inventoryMovements,
        db.inventoryLots, db.syncQueue, db.outbox,
      ], async (tx) => {
        // Revert ingredient consumption
        const recipe = await db.recipes.get(order.recipeId);
        if (recipe) {
          const lines = await db.recipeLines
            .where({ recipeId: order.recipeId })
            .filter((l) => !l.deletedAt)
            .toArray();

          const wasteMultiplier = 1 + (recipe.wastePct / 100);

          for (const line of lines) {
            // BUGFIX-MATHCEIL-001 [Paso-1]: Convertir a storage units antes del Math.ceil para no inflar fracciones.
            // (Bug histórico: Math.ceil(0.5) = 1 inflaba el revertimiento de la cancelación.)
            const product = await db.products.get(line.productId);
            const neededInStorage = product
              ? recipeQtyToStorage(line.quantity * order.batchCount * wasteMultiplier, line.unit, product.unit)
              : line.quantity * order.batchCount * wasteMultiplier;
            const needed = Math.ceil(neededInStorage);
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
            // DINERO-013 (M3): revertir solo el stock que aún existe (no las unidades ya vendidas).
            // quantityToRevert = min(stock actual, quantityTarget). Nunca resta de más.
            const quantityToRevert = Math.min(previousStock, order.quantityTarget);
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

          // C4: Revert finished product lot
          const finishedLots = await db.inventoryLots
            .where({ productId: order.productId })
            .filter((l) => !l.deletedAt && l.createdAt >= order.createdAt && l.createdAt <= now)
            .toArray();
          const lotToRevert = finishedLots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          if (lotToRevert && lotToRevert.remainingQuantity === lotToRevert.quantityAdded) {
            await db.inventoryLots.update(lotToRevert.id, { deletedAt: now, remainingQuantity: 0 });
            await syncQueue.enqueue('inventory_lots', 'UPDATE', lotToRevert.id, { id: lotToRevert.id, deleted_at: now, remaining_quantity: 0 }, tenantId);

            // DINERO-012 (M2): recalcular WAC del producto terminado después de revertir el lote
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
            const productForWac = await db.products.get(order.productId);
            if (productForWac) {
              await db.products.update(order.productId, { costPrice: newCostPrice });
              await syncQueue.enqueue('products', 'UPDATE', order.productId, toSnake({ ...productForWac, costPrice: newCostPrice } as unknown as Record<string, unknown>), tenantId);
            }
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
      return failure(new AppError('PRODUCTION_ORDER_CANCEL_FAILED', 'Error al cancelar la orden.'));
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
      return failure(new AppError('PRODUCTION_ORDERS_QUERY_FAILED', 'Error al cargar órdenes de producción.'));
    }
  },

  async consumeForAssembly(
    productId: string,
    quantity: number,
    tenantId: string,
    userId: string,
    options: { allowOverride?: boolean } = {},
  ): Promise<Result<{ consumedLots: Array<{ lotId: string; quantity: number }>; totalIngredientCost: number }, AppError>> {
    const db = getDb();
    const now = new Date().toISOString();
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

    const recipe = await db.recipes
      .where({ productId, mode: 'assembly' as const })
      .filter(r => !r.deletedAt && r.isActive)
      .first();

    if (!recipe) {
      return failure(new AppError(ProductionErrors.ASSEMBLY_NO_RECIPE, `Producto no tiene receta de ensamblaje.`));
    }

    // PRODUCTION-001-006: Expandir receta para resolver sub-recetas
    const expandResult = await expandRecipe(recipe.id, quantity);
    if (!expandResult.ok) return expandResult;
    const expandedLines = expandResult.data;

    if (expandedLines.length === 0) {
      return failure(new AppError(ProductionErrors.RECIPE_NO_INGREDIENTS, `La receta de ensamblaje no tiene ingredientes.`));
    }

    const wasteMultiplier = 1 + (recipe.wastePct / 100);
    let totalIngredientCost = 0;
    const assemblyConsumedLots: Array<{ lotId: string; quantity: number }> = [];

    for (const line of expandedLines) {
      // BUGFIX-MATHCEIL-001 [Paso-1]: Convertir a storage units antes del Math.ceil para no inflar fracciones.
      // (Bug histórico: Math.ceil(0.5) = 1 hacía que 1 combo con 0.5 kg de Harina consumiera 1 kg completo.)
      const ingredient = await db.products.get(line.productId);

      if (!ingredient) {
        return failure(new AppError(ProductionErrors.RECIPE_INGREDIENT_NOT_FOUND, `Ingrediente no encontrado.`));
      }

      const neededInStorage = recipeQtyToStorage(line.quantity * wasteMultiplier, line.unit, ingredient.unit);
      const needed = Math.ceil(neededInStorage);

      // PRODUCTION-003 [Paso-3]: Usando helper compartido para cálculo FIFO y plan de consumo.
      const calcResult = await calculateConsumptionCost(line.productId, needed, { allowOverride: options.allowOverride });
      if (!calcResult.ok) return failure(calcResult.error);
      const { totalCost: lineTotalCost, consumedLots } = calcResult.data;

      // Mantener isInsufficient para el reasonType del movement (override manual → ajuste_manual).
      const isInsufficient = ingredient.stock < needed;

      // Update product stock (igual que antes)
      const previousStock = ingredient.stock;
      const newStock = Math.max(0, previousStock - needed);

      await db.products.update(line.productId, { stock: newStock });
      await syncQueue.enqueue('products', 'UPDATE', line.productId, toSnake({ ...ingredient, stock: newStock } as unknown as Record<string, unknown>), tenantId);

      // Aplicar consumo a la DB (reducir remainingQuantity, incrementar version).
      for (const detail of consumedLots) {
        const currentLot = await db.inventoryLots.get(detail.lotId);
        if (!currentLot || currentLot.remainingQuantity <= 0) continue;
        // PRODUCTION-003 [Paso-3]: Si el costUsdPerUnit cambió entre la lectura del helper y la
        // actualización, hay conflicto concurrente (mismo control que el version check original).
        if (currentLot.costUsdPerUnit !== detail.costUsdPerUnit) {
          throw new AppError('INVENTORY_LOT_FIFO_CONFLICT', 'Conflicto en consumo FIFO.');
        }
        const newRemaining = currentLot.remainingQuantity - detail.quantity;
        const newVersion = (currentLot.version ?? 0) + 1;
        assemblyConsumedLots.push({ lotId: detail.lotId, quantity: detail.quantity });
        await db.inventoryLots.update(detail.lotId, { remainingQuantity: newRemaining, version: newVersion });
        await syncQueue.enqueue('inventory_lots', 'UPDATE', detail.lotId, toSnake({
          ...currentLot, remainingQuantity: newRemaining, version: newVersion,
        } as unknown as Record<string, unknown>), tenantId);
      }

      totalIngredientCost += lineTotalCost;
      const movementCostUsd = preciseRound(lineTotalCost, 2);

      const movementId = generateId();
      const reasonType = isInsufficient ? 'ajuste_manual' : 'consumo_interno';

      await db.inventoryMovements.add({
        id: movementId,
        tenantId,
        productId: line.productId,
        userId,
        type: 'adjustment' as const,
        quantity: -needed,
        previousStock,
        newStock,
        reasonType,
        costUsd: movementCostUsd,
        createdAt: now,
      });
      await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake({
        id: movementId, tenant_id: tenantUuid, product_id: line.productId, user_id: userId,
        type: 'adjustment', quantity: -needed, previous_stock: previousStock, new_stock: newStock,
        reason_type: reasonType, cost_usd: movementCostUsd, created_at: now,
      } as unknown as Record<string, unknown>), tenantId);
    }

    // POS-002 (C-10): builder discarded bug — emitWithPersistence returns {enqueueInTransaction, auditAfterTransaction}
    // which must be invoked explicitly. Use emitWithAudit directly (handles outbox + audit correctly).
    await emitWithAudit({
      eventName: 'PRODUCTION.ASSEMBLY_CONSUMED',
      module: PRODUCTION_MODULE,
      payload: { productId, quantity, tenantId },
      context: { userId, tenantId },
    });

    // PRODUCTION-003 [Paso-4]: Crear lote del combo ensamblado para tracking FIFO.
    // NO se descuenta stock del combo (se vende al instante) — el lote permite
    // trazabilidad temporal del costo real (FIFO) de cada combo producido.
    const comboLotId = generateId();
    const comboLot = {
      id: comboLotId,
      tenantId,
      productId,
      // DINERO-009 (A4): respetar quantity ensamblado (no siempre 1)
      quantityAdded: quantity,
      remainingQuantity: quantity,
      costUsdPerUnit: preciseRound(totalIngredientCost / quantity, 4),
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await db.inventoryLots.add(comboLot);
    await syncQueue.enqueue('inventory_lots', 'CREATE', comboLotId, toSnake(comboLot as unknown as Record<string, unknown>), tenantId);

    return success({ consumedLots: assemblyConsumedLots, totalIngredientCost });
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
