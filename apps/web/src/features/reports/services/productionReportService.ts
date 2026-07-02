import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { ReportsErrors } from '../../../specs/reports/errors';
import { ValidateTenantInputSchema } from '../../../specs/reports/index';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { getPermissionMessage } from '../../auth/permissions/messages';
import type { ProductionSummaryData, RecipeProfitabilityItem, ReportFilters } from '../types';
import { getDateRange, getRateForDateCached } from './reportsHelpers';

export async function getProductionSummary(tenantId: string, filters: ReportFilters): Promise<Result<ProductionSummaryData, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'reports', 'read')) {
    return failure(new AppError('REPORTS_SCOPE_DENIED', getPermissionMessage('reports', 'read')));
  }
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
  }
  try {
    const db = getDb();
    const { start, end } = getDateRange(filters);

    const recipes = await db.recipes
      .where({ tenantId })
      .filter((r) => !r.deletedAt)
      .toArray();

    const orders = await db.productionOrders
      .where({ tenantId })
      .filter((o) => !o.deletedAt && o.createdAt >= start && o.createdAt <= end)
      .toArray();

    const completedOrders = orders.filter((o) => o.status === 'done' || o.status === 'confirmed');
    const cancelledOrders = orders.filter((o) => o.status === 'cancelled');
    const totalQuantityProduced = orders.reduce((sum, o) => sum + (o.quantityProduced || o.quantityTarget), 0);

    // Most produced recipe
    const recipeProduction = new Map<string, { name: string; quantity: number }>();
    for (const order of orders) {
      if (order.status === 'cancelled') continue;
      const recipe = recipes.find((r) => r.id === order.recipeId);
      if (recipe) {
        const existing = recipeProduction.get(order.recipeId) || { name: recipe.name, quantity: 0 };
        existing.quantity += order.quantityProduced || order.quantityTarget;
        recipeProduction.set(order.recipeId, existing);
      }
    }
    let mostProduced: { name: string; quantity: number } | undefined;
    for (const [, data] of recipeProduction) {
      if (!mostProduced || data.quantity > mostProduced.quantity) {
        mostProduced = data;
      }
    }

    // Average waste
    const recipesWithWaste = recipes.filter((r) => r.wastePct > 0);
    const avgWaste = recipesWithWaste.length > 0
      ? preciseRound(recipesWithWaste.reduce((sum, r) => sum + r.wastePct, 0) / recipesWithWaste.length, 1)
      : 0;

    // Total ingredient cost (from inventory movements)
    const movements = await db.inventoryMovements
      .where({ tenantId })
      .filter((m) => !m.deletedAt && m.type === 'adjustment' && m.reasonType === 'consumo_interno' && m.createdAt >= start && m.createdAt <= end)
      .toArray();
    const totalIngredientCost = movements.reduce((sum, m) => sum + (m.costUsd || 0), 0);
    let totalIngredientCostBsCalc = 0;
    for (const m of movements) {
      const dayKey = m.createdAt.slice(0, 10);
      const rate = await getRateForDateCached(tenantId, dayKey);
      if (rate > 0) {
        totalIngredientCostBsCalc += (m.costUsd || 0) * rate;
      }
    }

    return success({
      totalRecipes: recipes.length,
      activeRecipes: recipes.filter((r) => r.isActive).length,
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      cancelledOrders: cancelledOrders.length,
      totalQuantityProduced,
      mostProducedRecipe: mostProduced?.name,
      mostProducedQuantity: mostProduced?.quantity,
      averageWastePct: avgWaste,
      totalIngredientCostUsd: preciseRound(totalIngredientCost, 2),
      totalIngredientCostBs: preciseRound(totalIngredientCostBsCalc, 2),
    });
  } catch (err) {
    console.error('[reportsService.getProductionSummary]', err);
    return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener resumen de producción.'));
  }
}

export async function getRecipeProfitability(tenantId: string, filters: ReportFilters): Promise<Result<RecipeProfitabilityItem[], AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'reports', 'read')) {
    return failure(new AppError('REPORTS_SCOPE_DENIED', getPermissionMessage('reports', 'read')));
  }
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
  }
  try {
    const db = getDb();
    const { start, end } = getDateRange(filters);

    const recipes = await db.recipes
      .where({ tenantId })
      .filter((r) => !r.deletedAt)
      .toArray();

    const orders = await db.productionOrders
      .where({ tenantId })
      .filter((o) => !o.deletedAt && o.createdAt >= start && o.createdAt <= end && o.status !== 'cancelled')
      .toArray();

    // Calculate recipe profitability
    const recipeStats = new Map<string, {
      recipeName: string;
      productName: string;
      mode: 'batch' | 'assembly';
      totalCostUsd: number;
      timesProduced: number;
      totalQuantityProduced: number;
      yieldUnit: string;
      wastePct: number;
    }>();

    for (const order of orders) {
      const recipe = recipes.find((r) => r.id === order.recipeId);
      if (!recipe) continue;

      // Get product name
      const session = useAuthStore.getState().session;
      const product = await db.products.where({ id: recipe.productId, tenantId: session?.tenantId }).first();
      const productName = product?.name || 'Desconocido';

      const existing = recipeStats.get(order.recipeId) || {
        recipeName: recipe.name,
        productName,
        mode: recipe.mode,
        totalCostUsd: 0,
        timesProduced: 0,
        totalQuantityProduced: 0,
        yieldUnit: recipe.yieldUnit,
        wastePct: recipe.wastePct,
      };

      existing.timesProduced++;
      existing.totalQuantityProduced += order.quantityProduced || order.quantityTarget;

      recipeStats.set(order.recipeId, existing);
    }

    // Get ingredient costs from movements
    const movements = await db.inventoryMovements
      .where({ tenantId })
      .filter((m) => !m.deletedAt && m.type === 'adjustment' && m.reasonType === 'consumo_interno' && m.createdAt >= start && m.createdAt <= end)
      .toArray();

    // Agregar recetas assembly desde ventas (saleItems)
    const assemblyRecipes = recipes.filter(r => r.mode === 'assembly');
    for (const recipe of assemblyRecipes) {
      const allSaleItems = await db.saleItems
        .where({ tenantId })
        .filter(si => !si.deletedAt && si.productId === recipe.productId)
        .toArray();

      const filteredItems = allSaleItems.filter(si => {
        return !si.createdAt || (si.createdAt >= start && si.createdAt <= end);
      });

      if (filteredItems.length > 0 && !recipeStats.has(recipe.id)) {
        const sess = useAuthStore.getState().session;
        const product = await db.products.where({ id: recipe.productId, tenantId: sess?.tenantId }).first();

        const totalQty = filteredItems.reduce((sum, si) => sum + si.quantity, 0);
        const totalCost = filteredItems.reduce((sum, si) => sum + ((si.costUsdPerUnit || 0) * si.quantity), 0);

        recipeStats.set(recipe.id, {
          recipeName: recipe.name,
          productName: product?.name || 'Desconocido',
          mode: 'assembly',
          totalCostUsd: totalCost,
          timesProduced: filteredItems.length,
          totalQuantityProduced: totalQty,
          yieldUnit: recipe.yieldUnit,
          wastePct: recipe.wastePct,
        });
      }
    }

    let totalCostBsAll = 0;
    for (const m of movements) {
      const dayKey = m.createdAt.slice(0, 10);
      const rate = await getRateForDateCached(tenantId, dayKey);
      if (rate > 0) totalCostBsAll += (m.costUsd || 0) * rate;
    }

    // Costo real: desde órdenes de producción (batch) o saleItems (assembly)
    for (const [recipeId, stats] of recipeStats) {
      if (stats.mode === 'batch' && stats.totalCostUsd === 0) {
        const ordersForRecipe = orders.filter(o => o.recipeId === recipeId);
        let orderTotalCost = 0;
        for (const order of ordersForRecipe) {
          if (order.totalCost) {
            orderTotalCost += order.totalCost;
          }
        }
        stats.totalCostUsd = orderTotalCost > 0 ? preciseRound(orderTotalCost, 2) : 0;
      }
    }

    const totalQuantity = Array.from(recipeStats.values()).reduce((sum, r) => sum + r.totalQuantityProduced, 0);

    // Convert to array and calculate cost per unit
    const result: RecipeProfitabilityItem[] = [];
    for (const [recipeId, stats] of recipeStats) {
      result.push({
        recipeId,
        recipeName: stats.recipeName,
        productName: stats.productName,
        mode: stats.mode,
        totalCostUsd: stats.totalCostUsd,
        totalCostBs: totalQuantity > 0 ? preciseRound((stats.totalQuantityProduced / totalQuantity) * totalCostBsAll, 2) : 0,
        timesProduced: stats.timesProduced,
        totalQuantityProduced: stats.totalQuantityProduced,
        yieldUnit: stats.yieldUnit,
        costPerUnitUsd: stats.totalQuantityProduced > 0
          ? preciseRound(stats.totalCostUsd / stats.totalQuantityProduced, 4)
          : 0,
        wastePct: stats.wastePct,
      });
    }

    // Sort by times produced descending
    result.sort((a, b) => b.timesProduced - a.timesProduced);

    return success(result);
  } catch (err) {
    console.error('[reportsService.getRecipeProfitability]', err);
    return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener rentabilidad de recetas.'));
  }
}
