import { type Result, success, failure, AppError, SystemEvents } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb, isDbClosing } from '../../../services/dexie/db';
import { type Transaction } from 'dexie';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { InventoryErrors } from '../../../specs/inventory/errors';
import type { Product, InventoryMovement, AdjustStockInput, ActiveLot } from '../types';
import { convertToStorage, unitToStorageType, toDisplayValue } from '../types';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { getPermissionMessage } from '../../auth/permissions/messages';
import { useAuthStore } from '../../auth/stores/authStore';
import { toNumber, toMovement, toProduct } from './mappers';

const INVENTORY_MODULE = 'INVENTORY';

interface SupabaseProductRow {
  id: string;
  tenant_id?: string;
  name: string;
  sku: string;
  is_weighted?: boolean;
  is_taxable?: boolean;
  is_sellable?: boolean;
  unit: Product['unit'];
  stock: number;
  stock_min?: number;
  image_url?: string;
  cost_price?: number;
  product_type?: Product['productType'];
}

export async function getAssemblyProductIds(tenantId: string): Promise<Set<string>> {
  try {
    const db = getDb();
    const recipes = await db.recipes
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isActive && r.mode === 'assembly')
      .toArray();
    return new Set(recipes.map((r) => r.productId));
  } catch {
    console.debug('[InventoryService] getAssemblyProductIds: error fetching recipes');
    return new Set();
  }
}

export async function adjustStock(input: AdjustStockInput & { userId: string; tenantId: string }): Promise<Result<InventoryMovement, AppError>> {
  const _adjSession = useAuthStore.getState().session;
  if (!_adjSession || !hasActionPermission(_adjSession, 'inventory', 'adjust_stock')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', getPermissionMessage('inventory', 'adjust_stock')));
  }

  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);

  if (!input.reasonType) {
    return failure(new AppError('INVENTORY_ADJUSTMENT_INVALID', 'Debes seleccionar un motivo para el ajuste.'));
  }

  const LOSS_REASONS = ['perdida', 'robo', 'vencido', 'consumo_interno', 'otros'];
  if (input.quantity > 0 && LOSS_REASONS.includes(input.reasonType)) {
    return failure(new AppError('INVENTORY_ADJUSTMENT_INVALID', 'No puedes agregar stock con motivo de pérdida.'));
  }

  const db = getDb();
  const product = await db.products
    .where({ tenantId: input.tenantId, id: input.productId })
    .filter((p) => !p.deletedAt)
    .first();
  if (!product) {
    return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
  }

  const now = new Date().toISOString();
  const previousStock = product.stock;
  
  const storageQuantity = product.isWeighted 
    ? convertToStorage(input.quantity, unitToStorageType(product.isWeighted, product.unit))
    : Math.round(input.quantity);

  const newStock = previousStock + storageQuantity;
 
  if (newStock < 0) {
    return failure(new AppError('PRODUCT_STOCK_NEGATIVE', 'El stock no puede ser negativo.'));
  }
 
  try {
    const movementId = generateId();
    let movementCostUsd: number | undefined;

    await db.transaction('rw', [db.products, db.inventoryMovements, db.inventoryLots, db.syncQueue, db.outbox], async (tx) => {
      if (storageQuantity > 0) {
        const lotId = generateId();
        const costPerUnit = input.costTotal != null && input.costTotal > 0
          ? preciseRound(input.costTotal / Math.abs(storageQuantity), 4)
          : await (async (): Promise<number> => {
              const lots = await db.inventoryLots
                .where({ tenantId: input.tenantId, productId: input.productId })
                .filter((l) => l.costUsdPerUnit !== undefined && l.costUsdPerUnit! > 0)
                .sortBy('createdAt');
              return lots.length > 0 ? (lots[lots.length - 1].costUsdPerUnit ?? 0) : 0;
            })();
        const lot = {
          id: lotId,
          tenantId: input.tenantId,
          productId: input.productId,
          quantityAdded: storageQuantity,
          remainingQuantity: storageQuantity,
          costUsdPerUnit: costPerUnit,
          sourceMovementId: movementId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await db.inventoryLots.add(lot);
        movementCostUsd = costPerUnit > 0 ? preciseRound(Math.abs(storageQuantity) * costPerUnit, 2) : undefined;

         const productForWac = await db.products.where({ tenantId: input.tenantId, id: input.productId }).first();
        if (productForWac) {
          const previousCostStorage = productForWac.isWeighted
            ? (productForWac.costPrice ?? 0) / 1000
            : (productForWac.costPrice ?? 0);

          const totalLotCost = (previousStock * previousCostStorage) + (storageQuantity * costPerUnit);
          const newCostPriceStorage = newStock > 0
            ? preciseRound(totalLotCost / newStock, 4)
            : costPerUnit;

          const newCostPrice = productForWac.isWeighted
            ? preciseRound(newCostPriceStorage * 1000, 4)
            : newCostPriceStorage;

          await db.products.update(input.productId, { stock: newStock, costPrice: newCostPrice });
        }
      } else {
        const fifoResult = await consumeFifo(input.productId, Math.abs(storageQuantity), input.tenantId, tx);
        if (!fifoResult.ok) throw new AppError('INVENTORY_STOCK_INSUFFICIENT', 'Stock insuficiente para completar el ajuste.');
        movementCostUsd = fifoResult.data.reduce((sum, c) => sum + ((c.costUsdPerUnit ?? 0) * c.quantity), 0);
        movementCostUsd = movementCostUsd > 0 ? preciseRound(movementCostUsd, 2) : undefined;

        await db.products.update(input.productId, { stock: newStock });
      }

      const movement = {
        id: movementId,
        tenantId: input.tenantId,
        productId: input.productId,
        userId: input.userId,
        type: 'adjustment' as const,
        quantity: storageQuantity,
        previousStock,
        newStock,
        reasonType: input.reasonType,
        costUsd: movementCostUsd,
        createdAt: now,
      };
      await db.inventoryMovements.add(movement);
 
      await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), input.tenantId);

      const updatedProduct = await db.products.where({ id: input.productId, tenantId: input.tenantId }).first();
      if (updatedProduct) {
        await syncQueue.enqueue('products', 'UPDATE', input.productId, toSnake(updatedProduct as unknown as Record<string, unknown>), input.tenantId);
      }
      await outboxService.enqueue(SystemEvents.INVENTORY_ADJUSTMENT, INVENTORY_MODULE, {
        productId: input.productId, quantity: input.quantity, reasonType: input.reasonType,
        previousStock, newStock, costUsd: movementCostUsd,
      });
    });

    // @ts-expect-error - syncEngine está disponible globalmente
    syncEngine.pushNow().catch((err: unknown) => logger.warn('Inventory', 'pushNow failed:', err));

    await logAuditEventOnly({
      eventName: SystemEvents.INVENTORY_ADJUSTMENT,
      module: INVENTORY_MODULE,
      payload: {
        productId: input.productId, quantity: input.quantity, reasonType: input.reasonType,
        previousStock, newStock, costUsd: movementCostUsd,
      },
      context: { userId: input.userId, tenantId: input.tenantId },
    });

    const resultMovement = {
      id: movementId,
      tenantId: input.tenantId,
      productId: input.productId,
      userId: input.userId,
      type: 'adjustment' as const,
      quantity: storageQuantity,
      previousStock,
      newStock,
      reasonType: input.reasonType,
      costUsd: movementCostUsd,
      createdAt: now,
    };
    return success(toMovement(resultMovement as unknown as Record<string, unknown>));
  } catch (err) {
    logger.error('adjustStock', 'Error:', err);
    if (err instanceof AppError) {
      return failure(err);
    }
    return failure(new AppError(InventoryErrors.INVENTORY_STOCK_INSUFFICIENT, 'Error al ajustar stock. Verifica el stock disponible.'));
  }
}

export async function getProductLots(productId: string): Promise<Result<ActiveLot[], AppError>> {
  const db = getDb();
  const session = useAuthStore.getState().session;
  if (!session?.tenantId) {
    return failure(new AppError(InventoryErrors.TENANT_REQUIRED, 'No hay tenant en sesión.'));
  }
  const productCheck = await db.products.where({ id: productId, tenantId: session.tenantId }).first();
  if (!productCheck || productCheck.deletedAt) {
    return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado en este tenant.'));
  }

  const lots = await db.inventoryLots
    .where({ productId, tenantId: session.tenantId })
    .filter((l) => l.remainingQuantity > 0)
    .sortBy('createdAt');

  return success(lots.map((l) => ({
    id: l.id,
    createdAt: l.createdAt,
    quantityAdded: toNumber(l.quantityAdded),
    remainingQuantity: toNumber(l.remainingQuantity),
    costUsdPerUnit: l.costUsdPerUnit != null ? toNumber(l.costUsdPerUnit) : undefined,
  })));
}

export async function consumeFifo(
  productId: string,
  quantity: number,
  tenantId: string,
  tx?: Transaction,
): Promise<Result<Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }>, AppError>> {
  if (!tenantId) {
    return failure(new AppError(InventoryErrors.TENANT_REQUIRED, 'No hay tenant en sesión.'));
  }
  const db = getDb();

  const execute = async (): Promise<Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }>> => {
    let lots = await db.inventoryLots
      .where({ tenantId, productId })
      .filter((l) => !l.deletedAt && l.remainingQuantity > 0)
      .sortBy('createdAt');

    if (lots.length === 0) {
      const product = await db.products.where({ tenantId, id: productId }).filter(p => !p.deletedAt).first();
      if (product && product.stock >= quantity) {
        if (!product.costPrice) {
          throw new AppError('CONSUME_NO_COST_DATA', `"${product.name}" no tiene costo registrado.`);
        }
        const now = new Date().toISOString();
        const implicitLot = {
          id: generateId(),
          tenantId,
          productId,
          quantityAdded: product.stock,
          remainingQuantity: product.stock,
          costUsdPerUnit: product.isWeighted
            ? (product.costPrice ?? 0) / 1000
            : (product.costPrice ?? 0),
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await db.inventoryLots.add(implicitLot as never);
        await syncQueue.enqueue('inventory_lots', 'CREATE', implicitLot.id, toSnake(implicitLot as unknown as Record<string, unknown>), tenantId);
        lots = [implicitLot as never];
      }
    }

    let toConsume = quantity;
    const consumed: Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }> = [];

    for (const lot of lots) {
      if (toConsume <= 0) break;

      const currentLot = await db.inventoryLots.get(lot.id);
      if (!currentLot) continue;
      if (currentLot.version !== lot.version) {
        throw new AppError(InventoryErrors.INVENTORY_LOT_FIFO_CONFLICT, 'Conflicto en consumo FIFO. Reintente la operación.');
      }

      const consumeQty = Math.min(currentLot.remainingQuantity, toConsume);
      const newRemaining = currentLot.remainingQuantity - consumeQty;
      const newVersion = currentLot.version + 1;
      await db.inventoryLots.update(lot.id, { remainingQuantity: newRemaining, version: newVersion });
      await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({
        ...lot, remainingQuantity: newRemaining, version: newVersion,
      } as unknown as Record<string, unknown>), tenantId);

      consumed.push({ lotId: lot.id, quantity: consumeQty, costUsdPerUnit: lot.costUsdPerUnit });
      toConsume -= consumeQty;
    }

    if (toConsume > 0) {
      throw new AppError(InventoryErrors.INVENTORY_STOCK_INSUFFICIENT, 'Stock insuficiente para completar la operación.');
    }
    return consumed;
  };

  if (tx) {
    try {
      const result = await execute();
      return success(result);
    } catch (err) {
      if (err instanceof AppError) return failure(err);
      throw err;
    }
  }

  return db.transaction('rw', [db.inventoryLots, db.syncQueue], async () => {
    try {
      const result = await execute();
      return success(result);
    } catch (err) {
      if (err instanceof AppError) return failure(err);
      throw err;
    }
  });
}

export async function getMovementHistory(productId: string, tenantId: string): Promise<Result<InventoryMovement[], AppError>> {
  if (!tenantId) {
    return failure(new AppError(InventoryErrors.TENANT_REQUIRED, 'No hay tenant en sesión.'));
  }
  const db = getDb();
  let rows = await db.inventoryMovements
    .where({ tenantId, productId })
    .filter((m) => !m.deletedAt)
    .sortBy('createdAt');

  if (rows.length === 0) {
    const query = supabase
      .from('inventory_movements')
      .select('*')
      .eq('product_id', productId);
    if (tenantId) {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      query.eq('tenant_id', tenantUuid);
    }
    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      for (const mov of data) {
        await db.inventoryMovements.add({
          id: mov.id, tenantId: tenantId ?? '',
          productId: mov.product_id,
          userId: mov.user_id,
          type: mov.type,
          quantity: mov.quantity,
          previousStock: mov.previous_stock,
          newStock: mov.new_stock,
          reason: mov.reason,
          reasonType: mov.reason_type,
          costUsd: mov.cost_usd ? Number(mov.cost_usd) : undefined,
          createdAt: mov.created_at,
        });
      }
      rows = await db.inventoryMovements.where({ productId }).sortBy('createdAt');
    }
  }

  const movements: InventoryMovement[] = [];
  for (const r of rows) {
    try {
      movements.push(toMovement(r as unknown as Record<string, unknown>));
    } catch (e) {
      logger.error(INVENTORY_MODULE, 'Skipping invalid movement record:', r.id, e);
    }
  }
  return success(movements.reverse());
}

export async function getLowStockProducts(tenantId: string): Promise<Result<Product[], AppError>> {
  const db = getDb();

  const assemblyRecipes = await db.recipes
    .where({ tenantId })
    .filter((r) => !r.deletedAt && r.isActive && r.mode === 'assembly')
    .toArray();
  const assemblyProductIds = new Set(assemblyRecipes.map((r) => r.productId));

  let rows = await db.products
    .where({ tenantId })
    .filter((p) => !p.deletedAt && !assemblyProductIds.has(p.id) && p.stockMin != null && p.stockMin > 0)
    .toArray();

  if (rows.length === 0) {
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantUuid)
      .is('deleted_at', null);

    if (!error && data && data.length > 0 && !isDbClosing()) {
      try {
        const productRecords = (data as SupabaseProductRow[]).map((prod) => {
          const prodRecord = prod as unknown as Record<string, unknown>;
          return {
            id: prod.id, tenantId,
            name: prod.name, sku: prod.sku,
            priceUsd: (prodRecord.price_usd as number | undefined) ?? 0,
            categoryId: prodRecord.category_id as string | undefined,
            isWeighted: prod.is_weighted !== undefined ? !!prod.is_weighted : false,
            isTaxable: prod.is_taxable !== undefined ? !!prod.is_taxable : true,
            isSellable: prod.is_sellable !== undefined ? !!prod.is_sellable : true,
            unit: prod.unit,
            stock: prod.stock,
            stockMin: prod.stock_min,
            productType: prod.product_type ?? 'resale',
          };
        });
        if (!isDbClosing()) {
          await db.products.bulkPut(productRecords);
        }
      } catch {
        // DB cerrada durante shutdown, ignorar
      }

      rows = await db.products
        .where({ tenantId })
    .filter((p) => !p.deletedAt && !assemblyProductIds.has(p.id) && p.stockMin != null && p.stockMin > 0)
        .toArray();
    }
  }

  const lowStock = rows.filter((p) => {
    const stock = toDisplayValue(p.stock, p.unit);
    const stockMin = toDisplayValue(p.stockMin!, p.unit);
    return stock <= stockMin;
  });
  return success(lowStock.map((r) => toProduct(r as unknown as Record<string, unknown>)));
}
