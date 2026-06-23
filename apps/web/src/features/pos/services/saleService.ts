import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound, toSnake, generateId } from '@logiscore/shared';
import { productionService, recipeQtyToStorageBase } from '../../production/services/productionService';
import { getDb } from '../../../services/dexie/db';
import type { DexieCashRegister } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { syncEngine } from '../../../services/sync/syncEngine';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { isSameDayVzla, startOfDayFromDateStringVzla, endOfDayFromDateStringVzla } from '../../../lib/date';
import { PosErrors } from '../../../specs/pos/errors';
import { InventoryErrors } from '../../../specs/inventory/errors';
import { CreateSaleInputSchema, calculateSaleTotals } from '../../../specs/pos';
import { saleFromSupabase, saleItemFromSupabase } from './mappers';
import type { Sale, SaleItem, CreateSaleInput, PaymentMethod } from '../types';
import { convertToStorage, unitToStorageType } from '../../../features/inventory/types';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useAuthStore } from '../../auth/stores/authStore';
import { useSettingsStore } from '../../settings/stores/settingsStore';

const MODULE_NAME = 'POS';

async function filterOrphanLots(
  lots: Array<{ lotId: string; quantity: number }>,
): Promise<Array<{ lotId: string; quantity: number }>> {
  if (lots.length === 0) return lots;
  const db = getDb();
  const results = await Promise.all(
    lots.map(async (cl) => {
      const lot = await db.inventoryLots.get(cl.lotId);
      return lot ? cl : null;
    }),
  );
  const filtered = results.filter((cl): cl is { lotId: string; quantity: number } => cl !== null);
  if (filtered.length < lots.length) {
    logger.warn(MODULE_NAME, `filterOrphanLots: removed ${lots.length - filtered.length} orphan lotId(s)`);
  }
  return filtered;
}

export async function createSale(input: CreateSaleInput): Promise<Result<Sale, AppError>> {
  const db = getDb();
  const { tenantId, userId, paymentMethod, items, exchangeRate, cashRegisterId } = input;

  const cashReg = cashRegisterId
    ? await db.cashRegisters.get(cashRegisterId)
    : await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();

  if (!cashReg) {
    return failure(new AppError('NO_ACTIVE_SESSION', 'Debe abrir una caja antes de vender'));
  }

  const openedDate = cashReg.openedAt ? new Date(cashReg.openedAt) : null;
  if (openedDate && !isSameDayVzla(openedDate, new Date())) {
    return failure(new AppError(PosErrors.SALE_BOX_CLOSED, 'La caja activa es del día anterior. Debe cerrarla antes de realizar ventas de hoy.'));
  }

  if (items.length === 0) {
    return failure(new AppError(PosErrors.SALE_NO_ITEMS, 'No hay productos en el carrito.'));
  }

  const rawExchangeRate = exchangeRate;
  if (!rawExchangeRate || rawExchangeRate <= 0) {
    return failure(new AppError(PosErrors.SALE_EXCHANGE_RATE_NOT_FOUND, 'No hay tasa de cambio configurada. Configure la tasa antes de vender.'));
  }

  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'pos', 'create')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }

  const parsed = CreateSaleInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(new AppError(PosErrors.SALE_TOTALS_MISMATCH, 'Datos de venta inválidos: ' + parsed.error.issues.map((e: { message: string }) => e.message).join(', ')));
  }

  const { ivaRate, igtfRate, igtfEnabled, maxDiscountPct, loaded: settingsLoaded } = useSettingsStore.getState();

  if (!settingsLoaded) {
    return failure(new AppError('SETTINGS_NOT_LOADED', 'Los ajustes del negocio aún se están cargando. Intenta de nuevo en unos segundos.'));
  }

  if (input.discountValue != null && input.discountValue > 0) {
    if (input.discountType === 'percentage' && input.discountValue > maxDiscountPct) {
      return failure(new AppError('SALE_DISCOUNT_EXCEEDS_MAX', `El descuento máximo permitido es ${maxDiscountPct}%.`));
    }
    if (input.discountType === 'fixed') {
      const subtotalUsd = items.reduce((s, i) => s + i.totalPriceUsd, 0);
      const pctOfTotal = subtotalUsd > 0 ? (input.discountValue / subtotalUsd) * 100 : 0;
      if (pctOfTotal > maxDiscountPct) {
        return failure(new AppError('SALE_DISCOUNT_EXCEEDS_MAX', `El descuento máximo permitido es ${maxDiscountPct}% del subtotal.`));
      }
    }
  }

  for (const item of items) {
    const expected = preciseRound(item.quantity * item.unitPriceUsd, 2);
    const diff = Math.abs(item.totalPriceUsd - expected);
    if (diff > 0.01) {
      return failure(new AppError(PosErrors.SALE_TOTALS_MISMATCH, `Inconsistencia en "${item.name}": precio total no coincide con cantidad × precio unitario.`));
    }
  }

  if (input.customerId) {
    const customer = await db.customers
      .where({ id: input.customerId })
      .filter((c) => c.tenantId === tenantId)
      .first();
    if (!customer || customer.deletedAt) {
      return failure(new AppError(PosErrors.SALE_CUSTOMER_UNAVAILABLE, 'Cliente no disponible. Seleccione otro cliente o venda sin cliente.'));
    }
  }

  const isCreditSale = input.paymentMethod === 'credito' && input.isCreditSale;
  if (isCreditSale) {
    if (!input.customerId) {
      return failure(new AppError('CUSTOMER_REQUIRED_FOR_CREDIT', 'Debe asignar un cliente para venta a crédito.'));
    }
    const creditCustomer = await db.customers
      .where({ id: input.customerId })
      .filter((c) => c.tenantId === tenantId && !c.deletedAt)
      .first();
    if (!creditCustomer) {
      return failure(new AppError('CUSTOMER_NOT_FOUND', 'Cliente no encontrado.'));
    }
    if (creditCustomer.creditLimit <= 0) {
      return failure(new AppError('CUSTOMER_NO_CREDIT_LIMIT', 'Este cliente no tiene crédito configurado. Configure el límite de crédito en el perfil del cliente.'));
    }
    const pendingCreditTotal = await db.sales
      .where({ tenantId })
      .filter((s) => !s.deletedAt && s.status === 'completed' && s.isCreditSale === true && !s.creditCollected && s.customerId === input.customerId)
      .toArray();
    const currentDebt = pendingCreditTotal.reduce((sum, s) => sum + s.totalUsd, 0);
    const roughTotalUsd = items.reduce((sum, i) => sum + i.totalPriceUsd, 0);
    if (currentDebt + roughTotalUsd > creditCustomer.creditLimit) {
      const available = Math.max(0, creditCustomer.creditLimit - currentDebt);
      return failure(new AppError('CREDIT_LIMIT_EXCEEDED', `El cliente excede su límite de crédito ($${creditCustomer.creditLimit.toFixed(2)}). Debe $${currentDebt.toFixed(2)}. Disponible: $${available.toFixed(2)}.`));
    }
  }

  const totals = calculateSaleTotals(
    items.map((i) => ({ unitPriceUsd: i.unitPriceUsd, quantity: i.quantity, isTaxable: i.isTaxable })),
    rawExchangeRate,
    paymentMethod,
    input.discountType && input.discountValue != null ? { type: input.discountType, value: input.discountValue } : null,
    {
      ivaRate,
      igtfRate: igtfEnabled ? igtfRate : 0,
    },
  );
  const { subtotalBs, igtfBs, ivaBs, discountBs, subtotalUsd, ivaUsd, totalUsd, discountUsd } = totals;
  const igtfUsd = rawExchangeRate > 0 ? preciseRound(igtfBs / rawExchangeRate, 4) : 0;

  let discountType: string | undefined;
  let discountValue: number | undefined;
  if (input.discountType && input.discountValue != null && input.discountValue > 0) {
    discountType = input.discountType;
    discountValue = input.discountValue;
  }

  const totalBs = preciseRound(subtotalBs + igtfBs + ivaBs - discountBs, 2);

  const saleId = generateId();
  const now = new Date().toISOString();
  const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

  const assemblyItems: Array<{ productId: string; quantity: number; productName?: string; presentationId?: string; presentationName?: string; unitMultiplier?: number }> = [];
  const normalItems: typeof items = [];

  for (const item of items) {
    const recipe = await db.recipes
      .where({ productId: item.productId, mode: 'assembly' as const })
      .filter(r => !r.deletedAt && r.isActive)
      .first();

    if (recipe) {
      assemblyItems.push({
        productId: item.productId,
        quantity: item.quantity,
        productName: item.name,
        presentationId: item.presentationId,
        presentationName: item.presentationName,
        unitMultiplier: item.unitMultiplier ?? 1,
      });
    } else {
      normalItems.push(item);
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txTables: any[] = [
      db.sales,
      db.saleItems,
      db.inventoryMovements,
      db.inventoryLots,
      db.products,
      db.cashRegisters,
      db.recipes,
      db.recipeLines,
      db.syncQueue,
      db.outbox,
    ];
    if (isCreditSale) txTables.push(db.customers);

    await db.transaction('rw', txTables, async (tx) => {
      if (isCreditSale && input.customerId) {
        const txCustomer = await db.customers.get(input.customerId);
        if (!txCustomer || txCustomer.deletedAt) {
          throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente no encontrado.');
        }
        const currentDebt = txCustomer.balance ?? 0;
        if (currentDebt + totalUsd > txCustomer.creditLimit) {
          const available = Math.max(0, txCustomer.creditLimit - currentDebt);
          throw new AppError('CREDIT_LIMIT_EXCEEDED', `El cliente excede su límite de crédito ($${txCustomer.creditLimit.toFixed(2)}). Debe $${currentDebt.toFixed(2)}. Disponible: $${available.toFixed(2)}.`);
        }
      }

      await db.sales.add({
        id: saleId,
        tenantId,
        userId,
        paymentMethod,
        subtotalBs,
        igtfBs,
        ivaBs,
        totalBs,
        exchangeRate: rawExchangeRate,
        status: 'completed',
        createdAt: now,
        discountType: discountType as 'percentage' | 'fixed' | undefined,
        discountValue: discountValue ?? undefined,
        discountBs: discountBs > 0 ? discountBs : undefined,
        customerId: input.customerId ?? undefined,
        subtotalUsd,
        ivaUsd,
        igtfUsd,
        totalUsd,
        discountUsd: discountUsd > 0 ? discountUsd : undefined,
        cashRegisterId: cashReg.id,
        isCreditSale,
        creditCollected: false,
      });

      const saleSnakePayload: Record<string, unknown> = {
        id: saleId,
        tenant_id: tenantUuid,
        user_id: userId,
        payment_method: paymentMethod,
        subtotal_bs: subtotalBs,
        igtf_bs: igtfBs,
        iva_bs: ivaBs,
        total_bs: totalBs,
        exchange_rate: rawExchangeRate,
        status: 'completed',
        created_at: now,
        subtotal_usd: subtotalUsd,
        iva_usd: ivaUsd,
        igtf_usd: igtfUsd,
        total_usd: totalUsd,
      };
      if (discountType) saleSnakePayload.discount_type = discountType;
      if (discountValue != null) saleSnakePayload.discount_value = discountValue;
      if (discountBs > 0) saleSnakePayload.discount_bs = discountBs;
      if (discountUsd > 0) saleSnakePayload.discount_usd = discountUsd;
      if (input.customerId) saleSnakePayload.customer_id = input.customerId;
      if (isCreditSale) {
        saleSnakePayload.is_credit_sale = true;
        saleSnakePayload.credit_collected = false;
      }
      await syncQueue.enqueue('sales', 'CREATE', saleId, toSnake(saleSnakePayload), tenantId);

      for (const cartItem of normalItems) {
        const product = await db.products.where({ id: cartItem.productId, tenantId }).first();
        if (!product || product.deletedAt) {
          throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Producto "${cartItem.name}" no encontrado.`);
        }

        const baseQuantity = product.isWeighted
          ? convertToStorage(cartItem.quantity, unitToStorageType(product.isWeighted, product.unit))
          : Math.round(cartItem.quantity);
        const storageQuantity = baseQuantity * (cartItem.unitMultiplier || 1);

        if (product.stock < storageQuantity) {
          throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Stock insuficiente para "${product.name}". Disponible: ${product.stock}.`);
        }

        let toConsume = storageQuantity;
        let totalCostUsd = 0;
        const consumedLots: Array<{ lotId: string; quantity: number }> = [];
        let lots = await db.inventoryLots
          .where({ productId: cartItem.productId })
          .filter((l) => l.remainingQuantity > 0)
          .sortBy('createdAt');

        if (lots.length === 0 && !product.costPrice) {
          throw new AppError('SALE_NO_COST_DATA', `"${product.name}" no tiene costo registrado. Registre un costo o reciba una compra primero.`);
        }

        if (lots.length === 0 && product.stock >= storageQuantity) {
          const implicitLot = {
            id: generateId(),
            tenantId,
            productId: cartItem.productId,
            quantityAdded: product.stock,
            remainingQuantity: product.stock,
            costUsdPerUnit: product.isWeighted
              ? (product.costPrice ?? 0) / 1000
              : (product.costPrice ?? 0),
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          await db.inventoryLots.add(implicitLot);
          await syncQueue.enqueue('inventory_lots', 'CREATE', implicitLot.id, toSnake(implicitLot as unknown as Record<string, unknown>), tenantId);
          lots = [implicitLot];
        }

        for (const lot of lots) {
          if (toConsume <= 0) break;
          const currentLot = await db.inventoryLots.get(lot.id);
          if (!currentLot || currentLot.remainingQuantity <= 0) continue;
          if (currentLot.version !== undefined && lot.version !== undefined && currentLot.version !== lot.version) {
            throw new AppError(InventoryErrors.INVENTORY_LOT_FIFO_CONFLICT, 'Conflicto de inventario concurrente. Reintente la operación.');
          }
          const lotCost = currentLot.costUsdPerUnit ?? 0;
          const newVersion = (currentLot.version ?? 0) + 1;
          if (currentLot.remainingQuantity >= toConsume) {
            totalCostUsd = preciseRound(totalCostUsd + toConsume * lotCost, 2);
            consumedLots.push({ lotId: lot.id, quantity: toConsume });
            await db.inventoryLots.update(lot.id, { remainingQuantity: currentLot.remainingQuantity - toConsume, version: newVersion });
            await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({ ...lot, remainingQuantity: currentLot.remainingQuantity - toConsume, version: newVersion } as unknown as Record<string, unknown>), tenantId);
            toConsume = 0;
          } else {
            totalCostUsd = preciseRound(totalCostUsd + currentLot.remainingQuantity * lotCost, 2);
            consumedLots.push({ lotId: lot.id, quantity: currentLot.remainingQuantity });
            toConsume -= currentLot.remainingQuantity;
            await db.inventoryLots.update(lot.id, { remainingQuantity: 0, version: newVersion });
            await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({ ...lot, remainingQuantity: 0, version: newVersion } as unknown as Record<string, unknown>), tenantId);
          }
        }

        if (toConsume > 0) {
          throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Stock insuficiente para "${product.name}" (lotes agotados).`);
        }

        const freshProduct = await db.products.where({ id: cartItem.productId, tenantId }).first();
        if (!freshProduct) {
          throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Producto "${cartItem.name}" no encontrado.`);
        }
        const previousStock = freshProduct.stock;
        const newStock = previousStock - storageQuantity;
        if (newStock < 0) {
          throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Stock insuficiente para "${product.name}". Disponible: ${previousStock}.`);
        }
        await db.products.update(cartItem.productId, { stock: newStock });

        const costUsdPerUnitStorage = storageQuantity > 0 ? preciseRound(totalCostUsd / storageQuantity, 6) : 0;
        const costUsdPerUnit = product.isWeighted
          ? preciseRound(costUsdPerUnitStorage * 1000, 4)
          : costUsdPerUnitStorage;

        const saleItemId = generateId();
        await db.saleItems.add({
          id: saleItemId,
          tenantId,
          saleId,
          productId: cartItem.productId,
          productName: product.name,
          productSku: product.sku ?? '',
          quantity: cartItem.quantity,
          unitPriceUsd: cartItem.unitPriceUsd,
          totalPriceUsd: cartItem.totalPriceUsd,
          costUsdPerUnit,
          isWeighted: product.isWeighted,
          unit: product.unit,
          presentationId: cartItem.presentationId,
          presentationName: cartItem.presentationName,
          unitMultiplier: cartItem.unitMultiplier ?? 1,
          createdAt: now,
          consumedLots,
        });

        const movementId = generateId();
        const movement = {
          id: movementId,
          tenantId,
          productId: cartItem.productId,
          userId,
          type: 'sale' as const,
          quantity: storageQuantity,
          previousStock,
          newStock,
          reason: `Venta #${saleId.slice(0, 8)}`,
          createdAt: now,
        };
        await db.inventoryMovements.add(movement);

        await syncQueue.enqueue('sale_items', 'CREATE', saleItemId, toSnake({
          id: saleItemId,
          tenant_id: tenantUuid,
          sale_id: saleId,
          product_id: cartItem.productId,
          product_name: product.name,
          product_sku: product.sku,
          quantity: cartItem.quantity,
          unit_price_usd: cartItem.unitPriceUsd,
          total_price_usd: cartItem.totalPriceUsd,
          cost_usd_per_unit: costUsdPerUnit,
          is_weighted: product.isWeighted,
          unit: product.unit,
          presentation_id: cartItem.presentationId ?? null,
          presentation_name: cartItem.presentationName ?? null,
          unit_multiplier: cartItem.unitMultiplier ?? 1,
          consumed_lots: (await filterOrphanLots(consumedLots)).length > 0 ? await filterOrphanLots(consumedLots) : null,
          created_at: now,
        } as unknown as Record<string, unknown>), tenantId);

        await syncQueue.enqueue('products', 'UPDATE', cartItem.productId, toSnake({ id: cartItem.productId, stock: newStock } as unknown as Record<string, unknown>), tenantId);
        await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
      }

      for (const assemblyItem of assemblyItems) {
        const scaledQuantity = assemblyItem.quantity * (assemblyItem.unitMultiplier ?? 1);
        const result = await productionService.consumeForAssembly(
          assemblyItem.productId,
          scaledQuantity,
          tenantId,
          userId,
          { allowOverride: input.allowOverride },
          tx,
        );

        if (!result.ok) {
          throw result.error;
        }

        const { consumedLots, totalIngredientCost } = result.data;
        const product = await db.products.where({ id: assemblyItem.productId, tenantId }).first();
        if (!product) {
          throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Producto "${assemblyItem.productName}" no encontrado.`);
        }

        const cartItemData = items.find(i => i.productId === assemblyItem.productId);
        const costUsdPerUnit = assemblyItem.quantity > 0 ? preciseRound(totalIngredientCost / assemblyItem.quantity, 4) : 0;

        const saleItemId = generateId();
        await db.saleItems.add({
          id: saleItemId,
          tenantId,
          saleId,
          productId: assemblyItem.productId,
          productName: product.name,
          productSku: product.sku ?? '',
          quantity: assemblyItem.quantity,
          unitPriceUsd: cartItemData?.unitPriceUsd ?? 0,
          totalPriceUsd: cartItemData?.totalPriceUsd ?? 0,
          costUsdPerUnit,
          isWeighted: false,
          unit: product.unit,
          presentationId: assemblyItem.presentationId,
          presentationName: assemblyItem.presentationName,
          unitMultiplier: assemblyItem.unitMultiplier ?? 1,
          createdAt: now,
          consumedLots,
        });

        await syncQueue.enqueue('sale_items', 'CREATE', saleItemId, toSnake({
          id: saleItemId,
          tenant_id: tenantUuid,
          sale_id: saleId,
          product_id: assemblyItem.productId,
          product_name: product.name,
          product_sku: product.sku,
          quantity: assemblyItem.quantity,
          unit_price_usd: cartItemData?.unitPriceUsd ?? 0,
          total_price_usd: cartItemData?.totalPriceUsd ?? 0,
          cost_usd_per_unit: costUsdPerUnit,
          is_weighted: false,
          unit: product.unit,
          presentation_id: assemblyItem.presentationId ?? null,
          presentation_name: assemblyItem.presentationName ?? null,
          consumed_lots: (await filterOrphanLots(consumedLots)).length > 0 ? await filterOrphanLots(consumedLots) : null,
          created_at: now,
        } as unknown as Record<string, unknown>), tenantId);
      }

      if (!isCreditSale) {
        const txCashReg = await db.cashRegisters.get(cashReg.id);
        if (txCashReg) {
          const newTotalSalesCount = (txCashReg.totalSalesCount ?? 0) + 1;
          const newTotalSalesBs = preciseRound((txCashReg.totalSalesBs ?? 0) + totalBs, 2);
          const newTotalIgtfBs = preciseRound((txCashReg.totalIgtfBs ?? 0) + igtfBs, 2);

          await db.cashRegisters.update(cashReg.id, {
            totalSalesCount: newTotalSalesCount,
            totalSalesBs: newTotalSalesBs,
            totalIgtfBs: newTotalIgtfBs,
            updatedAt: now,
          });

          await syncQueue.enqueue('cash_registers', 'UPDATE', cashReg.id, toSnake({
            id: cashReg.id,
            tenant_id: tenantUuid,
            total_sales_count: newTotalSalesCount,
            total_sales_bs: newTotalSalesBs,
            total_igtf_bs: newTotalIgtfBs,
            is_open: true,
            updated_at: now,
          } as unknown as Record<string, unknown>), tenantId);
        }
      }

      if (isCreditSale && input.customerId) {
        const customer = await db.customers.get(input.customerId);
        if (customer) {
          const newBalance = preciseRound(customer.balance + totalUsd, 2);
          await db.customers.update(input.customerId, { balance: newBalance, updatedAt: now });
          await syncQueue.enqueue('customers', 'UPDATE', input.customerId, toSnake({
            id: input.customerId,
            balance: newBalance,
            updated_at: now,
          } as unknown as Record<string, unknown>), tenantId);
        }
      }

      await outboxService.enqueue('SALE.COMPLETED', MODULE_NAME, {
        saleId,
        tenantSlug: tenantId,
        totalBs,
        paymentMethod,
        itemsCount: items.length,
        isCreditSale,
        ...(discountBs > 0 && { discountBs, discountType, discountValue }),
      }, tx);
    });

    await logAuditEventOnly({
      eventName: 'SALE.COMPLETED',
      module: MODULE_NAME,
      payload: { saleId, tenantSlug: tenantId, totalBs, paymentMethod, itemsCount: items.length },
      context: { userId, tenantId, tenantUuid },
    });


    syncEngine.pushNow().catch((err) => logger.warn(MODULE_NAME, 'pushNow failed (createSale):', err));

    return success({
      id: saleId,
      tenantId,
      userId,
      paymentMethod: paymentMethod as PaymentMethod,
      subtotalBs,
      igtfBs,
      ivaBs,
      totalBs,
      exchangeRate: rawExchangeRate,
      status: 'completed',
      createdAt: now,
      discountType: discountType as 'percentage' | 'fixed' | undefined,
      discountValue: discountValue ?? undefined,
      customerId: input.customerId,
      subtotalUsd,
      ivaUsd,
      igtfUsd,
      totalUsd,
      discountUsd: discountUsd > 0 ? discountUsd : undefined,
      isCreditSale,
      creditCollected: false,
    });
  } catch (err) {
    if (err instanceof AppError) return failure(err);
    logger.error('createSale', 'Error:', err);
    return failure(new AppError('SALE_TOTALS_MISMATCH', 'Error al completar la venta.'));
  }
}

export async function getSalesHistory(
  tenantId: string,
  offset = 0,
  limit = 50,
  startDate?: string,
  endDate?: string,
): Promise<Result<{ sales: Sale[]; total: number }, AppError>> {
  try {
    const db = getDb();

    const localSales = await db.sales
      .where({ tenantId })
      .filter((r) => {
        if (r.deletedAt || r.status !== 'completed') return false;
        if (startDate) {
          const saleDate = new Date(r.createdAt);
          if (saleDate < new Date(startOfDayFromDateStringVzla(startDate))) return false;
        }
        if (endDate) {
          const saleDate = new Date(r.createdAt);
          if (saleDate > new Date(endOfDayFromDateStringVzla(endDate))) return false;
        }
        return true;
      })
      .toArray();

    const total = localSales.length;

    if (total === 0) {
      const uuid = await TenantTranslator.slugToUuid(tenantId);
      let query = supabase
        .from('sales')
        .select('*')
        .eq('tenant_id', uuid)
        .is('deleted_at', null)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(50);

      if (startDate) {
        query = query.gte('created_at', startOfDayFromDateStringVzla(startDate));
      }
      if (endDate) {
        query = query.lte('created_at', endOfDayFromDateStringVzla(endDate));
      }

      const { data } = await query;

      if (data) {
        for (const raw of data) {
          const result = saleFromSupabase(raw, tenantId);
          if (!result.ok) continue;
          await db.sales.put(result.data);
        }
      }
    }

    localSales.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paged = localSales.slice(offset, offset + limit);

    return success({
      total: localSales.length,
      sales: paged.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        userId: r.userId,
        paymentMethod: r.paymentMethod as PaymentMethod,
        subtotalBs: r.subtotalBs,
        igtfBs: r.igtfBs,
        ivaBs: r.ivaBs !== undefined ? r.ivaBs : 0,
        totalBs: r.totalBs,
        exchangeRate: r.exchangeRate,
        status: r.status as 'completed' | 'voided',
        voidedAt: r.voidedAt ?? undefined,
        createdAt: r.createdAt,
        deletedAt: r.deletedAt ?? undefined,
        subtotalUsd: r.subtotalUsd,
        ivaUsd: r.ivaUsd,
        igtfUsd: r.igtfUsd,
        totalUsd: r.totalUsd,
        discountUsd: r.discountUsd,
        customerId: r.customerId ?? undefined,
        isCreditSale: r.isCreditSale ?? false,
        creditCollected: r.creditCollected ?? false,
        collectedAt: r.collectedAt ?? undefined,
      })),
    });
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getSalesHistory:', err);
    return failure(new AppError('SALES_HISTORY_FETCH_FAILED', 'Error al cargar historial de ventas.'));
  }
}

export async function getSaleItems(tenantId: string, saleId: string): Promise<Result<SaleItem[], AppError>> {
  try {
    const db = getDb();
    let rows = await db.saleItems
      .where({ saleId })
      .filter((r) => !r.deletedAt)
      .toArray();

    if (rows.length === 0) {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      if (!tenantUuid) {
        return failure(new AppError('AUTH_REQUIRED', 'Sesión inválida. Inicia sesión para cargar items de venta.'));
      }
      const { data } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', saleId)
        .eq('tenant_id', tenantUuid);

      if (data) {
        for (const raw of data) {
          const result = saleItemFromSupabase(raw);
          if (!result.ok) continue;
          await db.saleItems.put(result.data);
        }
        rows = await db.saleItems.where({ saleId }).toArray();
      }
    }

    return success(rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      saleId: r.saleId,
      productId: r.productId,
      productName: r.productName,
      productSku: r.productSku,
      quantity: r.quantity,
      unitPriceUsd: r.unitPriceUsd,
      totalPriceUsd: r.totalPriceUsd,
      costUsdPerUnit: r.costUsdPerUnit,
      isWeighted: r.isWeighted,
      unit: r.unit,
      presentationId: r.presentationId,
      presentationName: r.presentationName,
      unitMultiplier: r.unitMultiplier ?? 1,
      createdAt: r.createdAt,
    })));
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getSaleItems:', err);
    return failure(new AppError('SALE_ITEMS_FETCH_FAILED', 'Error al cargar items de venta.'));
  }
}

export async function voidSale(saleId: string, tenantId: string, userId: string): Promise<Result<void, AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'pos', 'void_sale')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }

  try {
    const db = getDb();
    const session = useAuthStore.getState().session;
    const sale = await db.sales.where({ id: saleId, tenantId: session?.tenantId }).first();
    if (!sale || sale.status !== 'completed') {
      return failure(new AppError(PosErrors.SALE_TOTALS_MISMATCH, 'Venta no encontrada o ya anulada.'));
    }

    const saleDate = new Date(sale.createdAt);
    if (!isSameDayVzla(saleDate, new Date())) {
      return failure(new AppError(PosErrors.SALE_TOTALS_MISMATCH, 'Solo se pueden anular ventas del día actual.'));
    }

    const items = await db.saleItems.where({ saleId }).toArray();
    const now = new Date().toISOString();
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

    if (sale.isCreditSale) {
      if (sale.creditCollected) {
        return failure(new AppError('CREDIT_SALE_PARTIALLY_COLLECTED', 'No se puede anular una venta a crédito que ya fue cobrada parcialmente. Contacte al administrador.'));
      }
    }

    let cashReg: DexieCashRegister | undefined;
    if (sale.cashRegisterId) {
      cashReg = await db.cashRegisters.where({ tenantId, id: sale.cashRegisterId }).first();
    }
    if (!cashReg) {
      const saleTs = new Date(sale.createdAt).getTime();
      const allRegisters = await db.cashRegisters
        .where({ tenantId })
        .filter((r) => !r.deletedAt)
        .toArray();
      cashReg = allRegisters.find((r) => {
        const opened = r.openedAt ? new Date(r.openedAt).getTime() : 0;
        const closed = r.closedAt ? new Date(r.closedAt).getTime() : Infinity;
        return opened <= saleTs && (r.isOpen || closed >= saleTs);
      }) ?? allRegisters.find((r) => r.isOpen);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txTables: any[] = [db.sales, db.saleItems, db.products, db.inventoryMovements, db.inventoryLots, db.cashRegisters, db.recipes, db.recipeLines, db.syncQueue, db.outbox];
    if (sale.isCreditSale && sale.customerId) txTables.push(db.customers);

    await db.transaction('rw', txTables, async (tx) => {
      await db.sales.update(saleId, { status: 'voided', voidedAt: now });

      for (const item of items) {
        const product = await db.products.where({ id: item.productId, tenantId }).first();
        if (!product || product.deletedAt) continue;

        const assemblyRecipe = await db.recipes
          .where({ productId: item.productId, mode: 'assembly' as const })
          .filter(r => !r.deletedAt && r.isActive)
          .first();

        if (assemblyRecipe) {
          const recipeLines = await db.recipeLines
            .where({ recipeId: assemblyRecipe.id })
            .filter(l => !l.deletedAt)
            .toArray();

          const wasteMultiplier = 1 + (assemblyRecipe.wastePct / 100);

          const hasConsumedLots = item.consumedLots && item.consumedLots.length > 0;
          const restoredByProduct = new Map<string, number>();

          if (hasConsumedLots) {
            for (const { lotId, quantity } of item.consumedLots!) {
              const currentLot = await db.inventoryLots.get(lotId);
              if (!currentLot) continue;
              const cap = currentLot.quantityAdded - currentLot.remainingQuantity;
              const restoreAmount = Math.min(quantity, cap);
              if (restoreAmount <= 0) continue;
              const newRemaining = currentLot.remainingQuantity + restoreAmount;
              const newVersion = (currentLot.version ?? 0) + 1;
              await db.inventoryLots.update(lotId, { remainingQuantity: newRemaining, version: newVersion });
              await syncQueue.enqueue('inventory_lots', 'UPDATE', lotId, toSnake({
                id: lotId, remainingQuantity: newRemaining, version: newVersion,
              } as unknown as Record<string, unknown>), tenantId);
              restoredByProduct.set(currentLot.productId, (restoredByProduct.get(currentLot.productId) ?? 0) + restoreAmount);
            }
          }

          for (const line of recipeLines) {
            const ingredient = await db.products.where({ id: line.productId, tenantId }).first();
            if (!ingredient) continue;

            const effectiveQty = item.quantity * (item.unitMultiplier ?? 1);
            const needed = Math.ceil(recipeQtyToStorageBase(line.quantity * effectiveQty * wasteMultiplier, line.unit, ingredient.unit));
            const previousStock = ingredient.stock;
            const restoredForThisIngredient = hasConsumedLots
              ? (restoredByProduct.get(line.productId) ?? 0)
              : needed;
            const newStock = previousStock + restoredForThisIngredient;

            await db.products.update(line.productId, { stock: newStock });
            await syncQueue.enqueue('products', 'UPDATE', line.productId, toSnake({ ...ingredient, stock: newStock } as unknown as Record<string, unknown>), tenantId);

            if (!hasConsumedLots) {
              const ingredientLots = await db.inventoryLots
                .where({ productId: line.productId })
                .filter(l => !l.deletedAt && l.remainingQuantity >= 0)
                .toArray();
              ingredientLots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

              let toRestore = needed;
              for (const lot of ingredientLots) {
                if (toRestore <= 0) break;
                const currentLot = await db.inventoryLots.get(lot.id);
                if (!currentLot) continue;
                if (currentLot.version !== undefined && lot.version !== undefined && currentLot.version !== lot.version) continue;
                const consumedFromLot = currentLot.quantityAdded - currentLot.remainingQuantity;
                if (consumedFromLot <= 0) continue;
                const restoreAmount = Math.min(toRestore, consumedFromLot);
                const newRemaining = currentLot.remainingQuantity + restoreAmount;
                const newVersion = (currentLot.version ?? 0) + 1;
                await db.inventoryLots.update(lot.id, { remainingQuantity: newRemaining, version: newVersion });
                await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({
                  id: lot.id, remainingQuantity: newRemaining, version: newVersion,
                } as unknown as Record<string, unknown>), tenantId);
                toRestore -= restoreAmount;
              }
              if (toRestore > 0) {
                const implicitLotId = generateId();
                await db.inventoryLots.add({
                  id: implicitLotId,
                  tenantId,
                  productId: line.productId,
                  quantityAdded: toRestore,
                  remainingQuantity: toRestore,
                  costUsdPerUnit: ingredient.costPrice ?? undefined,
                  createdAt: now,
                  updatedAt: now,
                  version: 1,
                });
                await syncQueue.enqueue('inventory_lots', 'CREATE', implicitLotId, toSnake({
                  id: implicitLotId, tenant_id: tenantUuid, product_id: line.productId,
                  quantity_added: toRestore, remaining_quantity: toRestore,
                  cost_usd_per_unit: ingredient.costPrice ?? undefined,
                  created_at: now, updated_at: now, version: 1,
                } as unknown as Record<string, unknown>), tenantId);
              }
            }

            const movementId = generateId();
            await db.inventoryMovements.add({
              id: movementId,
              tenantId,
              productId: line.productId,
              userId,
              type: 'adjustment',
              quantity: restoredForThisIngredient,
              previousStock,
              newStock,
              reason: `Anulación venta assembly #${saleId.slice(0, 8)}`,
              createdAt: now,
            });
            await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake({
              id: movementId, tenantId, productId: line.productId, userId,
              type: 'adjustment', quantity: restoredForThisIngredient, previousStock, newStock,
              reason: `Anulación venta assembly #${saleId.slice(0, 8)}`, createdAt: now,
            } as unknown as Record<string, unknown>), tenantId);
          }
        } else {
          const previousStock = product.stock;
          const baseQty = product.isWeighted
            ? convertToStorage(item.quantity, unitToStorageType(product.isWeighted, product.unit))
            : Math.round(item.quantity);
          const storageQty = baseQty * (item.unitMultiplier || 1);
          const newStock = previousStock + storageQty;
          await db.products.update(item.productId, { stock: newStock });

          if (item.consumedLots && item.consumedLots.length > 0) {
            for (const { lotId, quantity } of item.consumedLots) {
              const currentLot = await db.inventoryLots.get(lotId);
              if (!currentLot) continue;
              const cap = currentLot.quantityAdded - currentLot.remainingQuantity;
              const restoreAmount = Math.min(quantity, cap);
              if (restoreAmount <= 0) continue;
              const newRemaining = currentLot.remainingQuantity + restoreAmount;
              const newVersion = (currentLot.version ?? 0) + 1;
              await db.inventoryLots.update(lotId, { remainingQuantity: newRemaining, version: newVersion });
              await syncQueue.enqueue('inventory_lots', 'UPDATE', lotId, toSnake({
                id: lotId, remainingQuantity: newRemaining, version: newVersion,
              } as unknown as Record<string, unknown>), tenantId);
            }
          } else {
            const lots = await db.inventoryLots
              .where({ productId: item.productId })
              .filter((l) => !l.deletedAt && l.remainingQuantity >= 0)
              .toArray();
            lots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

            let toRestore = storageQty;
            for (const lot of lots) {
              if (toRestore <= 0) break;
              const currentLot = await db.inventoryLots.get(lot.id);
              if (!currentLot) continue;
              if (currentLot.version !== undefined && lot.version !== undefined && currentLot.version !== lot.version) continue;
              const consumedFromLot = currentLot.quantityAdded - currentLot.remainingQuantity;
              if (consumedFromLot <= 0) continue;
              const restoreAmount = Math.min(toRestore, consumedFromLot);
              const newRemaining = currentLot.remainingQuantity + restoreAmount;
              const newVersion = (currentLot.version ?? 0) + 1;
              await db.inventoryLots.update(lot.id, { remainingQuantity: newRemaining, version: newVersion });
              await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({
                id: lot.id, remainingQuantity: newRemaining, version: newVersion,
              } as unknown as Record<string, unknown>), tenantId);
              toRestore -= restoreAmount;
            }
            if (toRestore > 0) {
              const implicitLotId = generateId();
              await db.inventoryLots.add({
                id: implicitLotId,
                tenantId,
                productId: item.productId,
                quantityAdded: toRestore,
                remainingQuantity: toRestore,
                costUsdPerUnit: product.costPrice ?? undefined,
                createdAt: now,
                updatedAt: now,
                version: 1,
              });
              await syncQueue.enqueue('inventory_lots', 'CREATE', implicitLotId, toSnake({
                id: implicitLotId, tenant_id: tenantUuid, product_id: item.productId,
                quantity_added: toRestore, remaining_quantity: toRestore,
                cost_usd_per_unit: product.costPrice ?? undefined,
                created_at: now, updated_at: now, version: 1,
              } as unknown as Record<string, unknown>), tenantId);
            }
          }

          const movementId = generateId();
          await db.inventoryMovements.add({
            id: movementId,
            tenantId,
            productId: item.productId,
            userId,
            type: 'adjustment',
            quantity: storageQty,
            previousStock,
            newStock,
            reason: `Anulación venta #${saleId.slice(0, 8)}`,
            createdAt: now,
          });

          await syncQueue.enqueue('products', 'UPDATE', item.productId, toSnake({ id: item.productId, stock: newStock } as unknown as Record<string, unknown>), tenantId);
          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake({
            id: movementId, tenantId, productId: item.productId, userId,
            type: 'adjustment', quantity: storageQty, previousStock, newStock,
            reason: `Anulación venta #${saleId.slice(0, 8)}`, createdAt: now,
          } as unknown as Record<string, unknown>), tenantId);
        }
      }

      if (cashReg) {
        const txCashReg = await db.cashRegisters.get(cashReg.id);
        if (!txCashReg) {
          throw new AppError('CASH_REGISTER_NOT_FOUND', 'Caja no encontrada.');
        }
        if (!txCashReg.isOpen) {
          throw new AppError(
            PosErrors.SALE_VOID_BOX_CLOSED,
            'No se puede anular una venta cuya caja ya está cerrada. Crea un ajuste manual.',
          );
        }
        const regOpened = txCashReg.openedAt ?? txCashReg.createdAt;
        const regClosed = txCashReg.closedAt ?? now;
        const completedRegSales = await db.sales
          .where({ tenantId })
          .filter((s) =>
            !s.deletedAt &&
            s.status === 'completed' &&
            !s.voidedAt &&
            !s.isCreditSale &&
            s.createdAt >= regOpened &&
            s.createdAt <= regClosed,
          )
          .toArray();

        let canonicalTotalSalesBs = 0;
        let canonicalTotalIgtfBs = 0;
        for (const s of completedRegSales) {
          canonicalTotalSalesBs += s.totalBs;
          canonicalTotalIgtfBs += s.igtfBs;
        }
        canonicalTotalSalesBs = preciseRound(canonicalTotalSalesBs, 2);
        canonicalTotalIgtfBs = preciseRound(canonicalTotalIgtfBs, 2);
        const canonicalCount = completedRegSales.length;

        if (canonicalTotalSalesBs < 0) {
          logger.error('voidSale', `BUG: canonical totalSalesBs=${canonicalTotalSalesBs} en register ${txCashReg.id} tras anular ${saleId}. Usando 0.`);
          canonicalTotalSalesBs = 0;
        }
        if (canonicalTotalIgtfBs < 0) {
          logger.error('voidSale', `BUG: canonical totalIgtfBs=${canonicalTotalIgtfBs} en register ${txCashReg.id} tras anular ${saleId}. Usando 0.`);
          canonicalTotalIgtfBs = 0;
        }

        await db.cashRegisters.update(txCashReg.id, {
          totalSalesCount: canonicalCount,
          totalSalesBs: canonicalTotalSalesBs,
          totalIgtfBs: canonicalTotalIgtfBs,
          updatedAt: now,
        });

        await syncQueue.enqueue('cash_registers', 'UPDATE', txCashReg.id, toSnake({
          id: txCashReg.id,
          tenant_id: tenantUuid,
          total_sales_count: canonicalCount,
          total_sales_bs: canonicalTotalSalesBs,
          total_igtf_bs: canonicalTotalIgtfBs,
          updated_at: now,
        } as unknown as Record<string, unknown>), tenantId);
      }

      await outboxService.enqueue('SALE.VOIDED', MODULE_NAME, { saleId, tenantSlug: tenantId }, tx);

      await syncQueue.enqueue('sales', 'UPDATE', saleId, toSnake({
        id: saleId, tenant_id: tenantUuid, status: 'voided', voided_at: now,
      } as unknown as Record<string, unknown>), tenantId);

      if (sale.isCreditSale && sale.customerId && !sale.creditCollected) {
        const customer = await db.customers.get(sale.customerId);
        if (customer) {
          const newBalance = preciseRound(Math.max(0, customer.balance - sale.totalUsd), 2);
          await db.customers.update(sale.customerId, { balance: newBalance, updatedAt: now });
          await syncQueue.enqueue('customers', 'UPDATE', sale.customerId, toSnake({
            id: sale.customerId,
            balance: newBalance,
            updated_at: now,
          } as unknown as Record<string, unknown>), tenantId);
        }
      }
    });

    await logAuditEventOnly({
      eventName: 'SALE.VOIDED',
      module: MODULE_NAME,
      payload: { saleId, tenantSlug: tenantId },
      context: { userId, tenantId, tenantUuid },
    });
    return success(undefined);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en voidSale:', err);
    return failure(new AppError('SALE_VOID_FAILED', 'Error al anular la venta.'));
  }
}
