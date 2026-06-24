import { type Result, success, failure, AppError } from '@logiscore/core';
import { getDb, isDbClosing } from '../../../services/dexie/db';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { startOfDayVzla, endOfDayVzla } from '../../../lib/date';
import type { Product } from '../../../specs/inventory';

const MODULE_NAME = 'POS';

type VerificationProduct = {
  productId: string;
  productName: string;
  productSku: string;
  isWeighted: boolean;
  unit: string;
  logicalStock: number;
  soldToday: number;
  isLowStock: boolean;
  isZeroStock: boolean;
};

export async function getProductsForSale(tenantId: string): Promise<Result<Product[], AppError>> {
  try {
    const db = getDb();
    let allRecipes = await db.recipes.toArray();
    let assemblyProductIds = new Set(
      allRecipes
        .filter(r => !r.deletedAt && r.isActive && r.mode === 'assembly')
        .map(r => r.productId)
    );

    let rows = await db.products
      .where({ tenantId })
      .filter((p) => {
        if (p.deletedAt || p.isSellable === false || p.isIngredient) return false;
        if (p.stock > 0) return true;
        if (assemblyProductIds.has(p.id)) return true;
        return allRecipes.some(r => r.productId === p.id && !r.deletedAt && r.isActive);
      })
      .toArray();

    if (rows.length === 0) {
      if (!navigator.onLine) return success([]);

      const uuid = await TenantTranslator.slugToUuid(tenantId);
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', uuid)
        .is('deleted_at', null)
        .eq('is_sellable', true);

      if (data && !isDbClosing()) {
        try {
          for (const prod of data) {
            if (isDbClosing()) break;
            const local = {
              id: prod.id as string,
              tenantId,
              name: prod.name as string,
              sku: prod.sku as string,
              priceUsd: prod.price_usd as number,
              categoryId: prod.category_id as string | undefined,
              isWeighted: prod.is_weighted as boolean,
              isTaxable: prod.is_taxable !== undefined ? !!prod.is_taxable : true,
              isSellable: prod.is_sellable !== undefined ? !!prod.is_sellable : true,
              unit: prod.unit as Product['unit'],
              stock: prod.stock as number,
              stockMin: prod.stock_min as number | undefined,
              imageUrl: prod.image_url as string | undefined,
            };
            await db.products.put(local);
          }
          } catch {
            // DB closed during shutdown, ignore
          }

          try {
          const { data: recipesData } = await supabase
            .from('recipes')
            .select('*')
            .eq('tenant_id', uuid)
            .is('deleted_at', null);
          if (recipesData) {
            for (const rec of recipesData) {
              if (isDbClosing()) break;
              const localRecipe = {
                id: rec.id as string,
                tenantId,
                name: rec.name as string,
                productId: rec.product_id as string,
                mode: rec.mode as 'batch' | 'assembly',
                yieldQuantity: rec.yield_quantity as number,
                yieldUnit: rec.yield_unit as string,
                wastePct: rec.waste_pct ?? 0,
                isActive: rec.is_active !== undefined ? !!rec.is_active : true,
                notes: rec.notes as string | undefined,
                createdAt: rec.created_at ?? new Date().toISOString(),
                updatedAt: rec.updated_at ?? new Date().toISOString(),
              };
              await db.recipes.put(localRecipe);
            }
            allRecipes = await db.recipes.toArray();
            assemblyProductIds = new Set(
              allRecipes
                .filter(r => !r.deletedAt && r.isActive && r.mode === 'assembly')
                .map(r => r.productId)
            );
          }
          } catch {
            // DB closed during shutdown, ignore
          }

          rows = await db.products
          .where({ tenantId })
          .filter((p) => {
        if (p.deletedAt || p.isSellable === false || p.isIngredient) return false;
            if (p.stock > 0) return true;
            if (assemblyProductIds.has(p.id)) return true;
            return allRecipes.some(r => r.productId === p.id && !r.deletedAt && r.isActive);
          })
          .toArray();
      }
    }

    return success(rows.map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      sku: String(r.sku ?? ''),
      priceUsd: Number(r.priceUsd) || 0,
      categoryId: r.categoryId ? String(r.categoryId) : undefined,
      isWeighted: r.isWeighted === true,
      isTaxable: r.isTaxable !== undefined ? r.isTaxable : true,
      isSellable: r.isSellable !== undefined ? r.isSellable : true,
      unit: (String(r.unit ?? 'unidad') as 'kg' | 'gr' | 'lt' | 'm' | 'unidad'),
      stock: typeof r.stock === 'number' && Number.isFinite(r.stock) ? r.stock : 0,
      stockMin: r.stockMin ?? undefined,
      deletedAt: r.deletedAt,
      imageUrl: r.imageUrl ?? undefined,
      hasAssemblyRecipe: assemblyProductIds.has(r.id),
    })));
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getProductsForSale:', err);
    return failure(new AppError('PRODUCTS_FETCH_FAILED', 'Error al cargar productos para venta.'));
  }
}

export async function getTodaySoldProducts(
  tenantId: string,
  maxProducts = 10,
  referenceDate?: Date,
): Promise<Result<Array<{ productId: string; productName: string; productSku: string; quantity: number }>, AppError>> {
  try {
    const todayStart = startOfDayVzla(referenceDate);
    const todayEnd = endOfDayVzla(referenceDate);
    const db = getDb();

    const sales = await db.sales
      .where({ tenantId })
      .filter((s) => {
        if (s.deletedAt || s.status !== 'completed') return false;
        return s.createdAt >= todayStart && s.createdAt <= todayEnd;
      })
      .toArray();

    if (sales.length === 0) return success([]);

    const saleIds = sales.map((s) => s.id);
    const allItems = await db.saleItems.where('saleId').anyOf(saleIds).toArray();

    const productMap = new Map<string, { productId: string; productName: string; productSku: string; quantity: number }>();

    for (const item of allItems) {
      const normalizedQty = item.quantity * (item.unitMultiplier || 1);
      const existing = productMap.get(item.productId);
      if (existing) {
        existing.quantity += normalizedQty;
      } else {
        productMap.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: normalizedQty,
        });
      }
    }

    const sorted = Array.from(productMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, maxProducts);

    return success(sorted);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getTodaySoldProducts:', err);
    return failure(new AppError('TOP_SOLD_FETCH_FAILED', 'Error al obtener productos más vendidos.'));
  }
}

export async function getVerificationProducts(tenantId: string, referenceDate?: Date): Promise<Result<VerificationProduct[], AppError>> {
  try {
    const db = getDb();
    const [soldResult, lowStockResult, zeroStockRows, assemblyRecipes] = await Promise.all([
      getTodaySoldProducts(tenantId, 10, referenceDate),
      (await import('../../inventory/services/inventoryService')).inventoryService.getLowStockProducts(tenantId),
      db.products.where({ tenantId }).filter((p) => !p.deletedAt && p.stock === 0 && p.isSellable !== false).toArray(),
      db.recipes.where({ tenantId }).filter((r) => !r.deletedAt && r.isActive && r.mode === 'assembly').toArray(),
    ]);

    const assemblyIds = new Set(assemblyRecipes.map((r) => r.productId));
    const filteredZeroStock = zeroStockRows.filter((p) => !assemblyIds.has(p.id));

    const productIds = new Set<string>();
    if (soldResult.ok) for (const p of soldResult.data) { if (!assemblyIds.has(p.productId)) productIds.add(p.productId); }
    if (lowStockResult.ok) for (const p of lowStockResult.data) { if (!assemblyIds.has(p.id)) productIds.add(p.id); }
    for (const p of filteredZeroStock) productIds.add(p.id);

    if (productIds.size === 0) return success([]);

    const soldMap = new Map<string, number>();
    if (soldResult.ok) for (const p of soldResult.data) { if (!assemblyIds.has(p.productId)) soldMap.set(p.productId, p.quantity); }

    const lowStockIds = new Set<string>();
    if (lowStockResult.ok) for (const p of lowStockResult.data) lowStockIds.add(p.id);

    const zeroStockIds = new Set(filteredZeroStock.map((p) => p.id));

    const products = await db.products
      .where({ tenantId })
      .filter((p) => !p.deletedAt && productIds.has(p.id))
      .toArray();

    const verified = products.map((p) => ({
      productId: p.id,
      productName: p.name,
      productSku: p.sku ?? '',
      isWeighted: p.isWeighted,
      unit: p.unit,
      logicalStock: p.stock,
      soldToday: parseFloat((soldMap.get(p.id) ?? 0).toFixed(2)),
      isLowStock: lowStockIds.has(p.id),
      isZeroStock: zeroStockIds.has(p.id),
    }));

    verified.sort((a, b) => {
      if (a.isZeroStock && !b.isZeroStock) return -1;
      if (!a.isZeroStock && b.isZeroStock) return 1;
      if (a.isLowStock && !b.isLowStock) return -1;
      if (!a.isLowStock && b.isLowStock) return 1;
      return b.soldToday - a.soldToday;
    });

    return success(verified);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getVerificationProducts:', err);
    return failure(new AppError('VERIFICATION_FETCH_FAILED', 'Error al cargar productos para verificación.'));
  }
}
