import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound, toSnake, generateId, IGTF_RATE, IVA_RATE } from '@logiscore/shared';
import { getDb, isDbClosing } from '../../../services/dexie/db';
import type { DexieCashRegister, LogisCoreDB } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { syncEngine } from '../../../services/sync/syncEngine';
import { outboxService } from '../../../services/outbox/outboxService';
import { emitWithAudit } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { isSameDayVzla, startOfDayVzla, endOfDayVzla } from '../../../lib/date';
import { PosErrors } from '../../../specs/pos/errors';
import { InventoryErrors } from '../../../specs/inventory/errors';
import { CreateSaleInputSchema } from '../../../specs/pos';
import type { Sale, SaleItem, CashRegister, CreateSaleInput, OpenCashRegisterInput, CloseCashRegisterInput, PaymentMethod } from '../types';
import type { Product } from '../../../specs/inventory';
import { convertToStorage } from '../../../features/inventory/types';

const MODULE_NAME = 'POS';

async function autoCloseRegister(
  db: LogisCoreDB,
  register: DexieCashRegister,
  tenantId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
  const expectedClosingBs = preciseRound(
    (register.openingBalanceBs ?? 0) + register.totalSalesBs, 2,
  );

  await db.transaction('rw', [db.cashRegisters, db.syncQueue, db.outbox], async () => {
    await db.cashRegisters.update(register.id, {
      isOpen: false,
      closedBy: userId,
      closedAt: now,
      closingBalanceBs: expectedClosingBs,
      closingRate: register.openingRate,
      expectedClosingBs,
      differenceBs: 0,
      updatedAt: now,
    });

    await syncQueue.enqueue('cash_registers', 'UPDATE', register.id, toSnake({
      id: register.id,
      tenant_id: tenantUuid,
      is_open: false,
      closed_by: userId,
      closed_at: now,
      closing_balance_bs: expectedClosingBs,
      closing_rate: register.openingRate,
      expected_closing_bs: expectedClosingBs,
      difference_bs: 0,
      total_sales_count: register.totalSalesCount,
      total_sales_bs: register.totalSalesBs,
      total_igtf_bs: register.totalIgtfBs,
      updated_at: now,
    } as Record<string, unknown>), tenantId);

    await outboxService.enqueue('BOX.CLOSED', MODULE_NAME, {
      registerId: register.id,
      tenantSlug: tenantId,
      expectedBs: expectedClosingBs,
      declaredBs: expectedClosingBs,
      differenceBs: 0,
      autoClosed: true,
    });
  });

  await emitWithAudit('BOX.CLOSED', MODULE_NAME, {
    registerId: register.id,
    tenantSlug: tenantId,
    expectedBs: expectedClosingBs,
    declaredBs: expectedClosingBs,
    differenceBs: 0,
    autoClosed: true,
  }, {
    userId,
    tenantId,
    tenantUuid,
  });

  // Push inmediato para sincronizar cierre automático a la nube
  syncEngine.pushNow().catch(() => {});
}

export const posService = {
  async getCashRegister(tenantId: string): Promise<Result<CashRegister | null, AppError>> {
    try {
      const db = getDb();

      let row = await db.cashRegisters
        .where({ tenantId })
        .filter((r) => !r.deletedAt && r.isOpen)
        .first();

      if (!row) {
        row = await db.cashRegisters
          .where({ tenantId })
          .filter((r) => !r.deletedAt)
          .reverse()
          .first();
      }

      if (!row) {
        if (!navigator.onLine) return success(null);

        const uuid = await TenantTranslator.slugToUuid(tenantId);
        const { data } = await supabase
          .from('cash_registers')
          .select('*')
          .eq('tenant_id', uuid)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          row = {
            id: data.id as string,
            tenantId,
            isOpen: data.is_open as boolean,
            openedBy: data.opened_by as string | null,
            openedAt: data.opened_at as string | null,
            openingBalanceBs: data.opening_balance_bs as number | null,
            openingRate: data.opening_rate as number | null,
            closedBy: data.closed_by as string | null,
            closedAt: data.closed_at as string | null,
            closingBalanceBs: data.closing_balance_bs as number | null,
            closingRate: data.closing_rate as number | null,
            expectedClosingBs: data.expected_closing_bs as number | null,
            differenceBs: data.difference_bs as number | null,
            totalSalesCount: data.total_sales_count as number,
            totalSalesBs: data.total_sales_bs as number,
            totalIgtfBs: data.total_igtf_bs as number,
            createdAt: data.created_at as string,
            updatedAt: data.updated_at as string,
          };
          await db.cashRegisters.put(row);
        }
      }

      if (!row) return success(null);

      return success({
        id: row.id,
        tenantId: row.tenantId,
        isOpen: row.isOpen,
        openedBy: row.openedBy,
        openedAt: row.openedAt,
        openingBalanceBs: row.openingBalanceBs,
        openingRate: row.openingRate,
        closedBy: row.closedBy,
        closedAt: row.closedAt,
        closingBalanceBs: row.closingBalanceBs,
        closingRate: row.closingRate,
        expectedClosingBs: row.expectedClosingBs,
        differenceBs: row.differenceBs,
        totalSalesCount: row.totalSalesCount,
        totalSalesBs: row.totalSalesBs,
        totalIgtfBs: row.totalIgtfBs,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt ?? null,
      });
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getCashRegister:', err);
      return failure(new AppError(PosErrors.BOX_QUERY_FAILED, 'Error al consultar el estado de la caja.'));
    }
  },

  async getProductsForSale(tenantId: string): Promise<Result<Product[], AppError>> {
    try {
      const db = getDb();
      let rows = await db.products
        .where({ tenantId })
        .filter((p) => !p.deletedAt && p.stock > 0 && p.isSellable !== false)
        .toArray();

      if (rows.length === 0) {
        if (!navigator.onLine) return success([]);

        const uuid = await TenantTranslator.slugToUuid(tenantId);
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', uuid)
          .is('deleted_at', null)
          .gt('stock', 0)
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
            // DB cerrada durante shutdown, ignorar
          }
          rows = await db.products
            .where({ tenantId })
            .filter((p) => !p.deletedAt && p.stock > 0 && p.isSellable !== false)
            .toArray();
        }
      }

      return success(rows.map((r) => ({
        id: r.id,
        name: r.name,
        sku: r.sku,
        priceUsd: r.priceUsd,
        categoryId: r.categoryId,
        isWeighted: r.isWeighted,
        isTaxable: r.isTaxable !== undefined ? r.isTaxable : true,
        isSellable: r.isSellable !== undefined ? r.isSellable : true,
        unit: r.unit,
        stock: r.stock,
        stockMin: r.stockMin,
        deletedAt: r.deletedAt,
        imageUrl: r.imageUrl,
      })));
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getProductsForSale:', err);
      return failure(new AppError('PRODUCTS_FETCH_FAILED', 'Error al cargar productos para venta.'));
    }
  },

  async createSale(input: CreateSaleInput): Promise<Result<Sale, AppError>> {
    const db = getDb();
    const { tenantId, userId, paymentMethod, items, exchangeRate } = input;

    const cashReg = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();

    if (!cashReg) {
      return failure(new AppError(PosErrors.SALE_BOX_CLOSED, 'La caja esta cerrada. Abrala para realizar ventas.'));
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

    const parsed = CreateSaleInputSchema.safeParse(input);
    if (!parsed.success) {
      return failure(new AppError(PosErrors.SALE_TOTALS_MISMATCH, 'Datos de venta invalidos: ' + parsed.error.errors.map((e) => e.message).join(', ')));
    }

    let subtotalBs = 0;
    let subtotalTaxableBs = 0;
    for (const item of items) {
      const prod = await getDb().products.get(item.productId);
      const isTaxable = prod?.isTaxable !== undefined ? prod.isTaxable : true;
      const lineBs = preciseRound(item.unitPriceUsd * item.quantity * rawExchangeRate, 2);
      subtotalBs += lineBs;
      if (isTaxable) subtotalTaxableBs += lineBs;
    }
    subtotalBs = preciseRound(subtotalBs, 2);
    subtotalTaxableBs = preciseRound(subtotalTaxableBs, 2);

    const igtfBs = paymentMethod === 'efectivo_usd'
      ? preciseRound(subtotalBs * IGTF_RATE, 2)
      : 0;

    // Calcular descuento si aplica
    let discountBs = 0;
    let discountType: string | undefined;
    let discountValue: number | undefined;
    let ivaBase = subtotalTaxableBs;

    if (input.discountType && input.discountValue != null && input.discountValue > 0) {
      discountType = input.discountType;
      discountValue = input.discountValue;

      if (discountType === 'percentage') {
        const pct = Math.min(discountValue, 100);
        discountBs = preciseRound(subtotalBs * pct / 100, 2);
        const taxableDiscount = preciseRound(subtotalTaxableBs * pct / 100, 2);
        ivaBase = subtotalTaxableBs - taxableDiscount;
      } else if (discountType === 'fixed') {
        discountBs = preciseRound(discountValue * rawExchangeRate, 2);
        if (subtotalBs > 0) {
          const taxableRatio = subtotalTaxableBs / subtotalBs;
          const taxableDiscount = preciseRound(discountBs * taxableRatio, 2);
          ivaBase = subtotalTaxableBs - taxableDiscount;
        }
      }

      discountBs = Math.min(discountBs, subtotalBs);
      ivaBase = Math.max(0, ivaBase);
    }

    const ivaBs = preciseRound(ivaBase * IVA_RATE, 2);

    const totalBs = preciseRound(subtotalBs + igtfBs + ivaBs - discountBs, 2);

    const saleId = generateId();
    const now = new Date().toISOString();
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

    try {
      await db.transaction('rw', [
        db.sales,
        db.saleItems,
        db.inventoryMovements,
        db.inventoryLots,
        db.products,
        db.cashRegisters,
        db.syncQueue,
        db.outbox,
      ], async () => {
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
        };
        if (discountType) saleSnakePayload.discount_type = discountType;
        if (discountValue != null) saleSnakePayload.discount_value = discountValue;
        if (discountBs > 0) saleSnakePayload.discount_bs = discountBs;
        await syncQueue.enqueue('sales', 'CREATE', saleId, toSnake(saleSnakePayload), tenantId);

        for (const cartItem of items) {
          const product = await db.products.get(cartItem.productId);
          if (!product || product.deletedAt) {
            throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Producto "${cartItem.name}" no encontrado.`);
          }

          const storageQuantity = product.isWeighted
            ? convertToStorage(cartItem.quantity, product.unit === 'lt' ? 'pesable_lt' : 'pesable_kg')
            : Math.round(cartItem.quantity);

          if (product.stock < storageQuantity) {
            throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Stock insuficiente para "${product.name}". Disponible: ${product.stock}.`);
          }

          let toConsume = storageQuantity;
          let totalCostUsd = 0;
          let lots = await db.inventoryLots
            .where({ productId: cartItem.productId })
            .filter((l) => l.remainingQuantity > 0)
            .sortBy('createdAt');

          if (lots.length === 0 && product.stock >= storageQuantity) {
            const implicitLot = {
              id: generateId(),
              tenantId,
              productId: cartItem.productId,
              quantityAdded: product.stock,
              remainingQuantity: product.stock,
              costUsdPerUnit: product.priceUsd,
              createdAt: now,
              updatedAt: now,
            };
            await db.inventoryLots.add(implicitLot);
            await syncQueue.enqueue('inventory_lots', 'CREATE', implicitLot.id, toSnake(implicitLot as unknown as Record<string, unknown>), tenantId);
            lots = [implicitLot];
          }

          for (const lot of lots) {
            if (toConsume <= 0) break;
            // Optimistic locking: re-read version before update
            const currentLot = await db.inventoryLots.get(lot.id);
            if (!currentLot || currentLot.remainingQuantity <= 0) continue;
            if (currentLot.version !== undefined && lot.version !== undefined && currentLot.version !== lot.version) {
              throw new AppError(InventoryErrors.INVENTORY_LOT_FIFO_CONFLICT, 'Conflicto en consumo FIFO. Reintente la operación.');
            }
            const lotCost = currentLot.costUsdPerUnit ?? 0;
            const newVersion = (currentLot.version ?? 0) + 1;
            if (currentLot.remainingQuantity >= toConsume) {
              totalCostUsd += toConsume * lotCost;
              await db.inventoryLots.update(lot.id, { remainingQuantity: currentLot.remainingQuantity - toConsume, version: newVersion });
              await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({ ...lot, remainingQuantity: currentLot.remainingQuantity - toConsume, version: newVersion } as unknown as Record<string, unknown>), tenantId);
              toConsume = 0;
            } else {
              totalCostUsd += currentLot.remainingQuantity * lotCost;
              toConsume -= currentLot.remainingQuantity;
              await db.inventoryLots.update(lot.id, { remainingQuantity: 0, version: newVersion });
              await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({ ...lot, remainingQuantity: 0, version: newVersion } as unknown as Record<string, unknown>), tenantId);
            }
          }

          if (toConsume > 0) {
            throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Stock insuficiente para "${product.name}" (lotes agotados).`);
          }

          const previousStock = product.stock;
          const newStock = previousStock - storageQuantity;
          await db.products.update(cartItem.productId, { stock: newStock });

          const costUsdPerUnit = storageQuantity > 0 ? preciseRound(totalCostUsd / storageQuantity, 2) : 0;

          const saleItemId = generateId();
          await db.saleItems.add({
            id: saleItemId,
            tenantId,
            saleId,
            productId: cartItem.productId,
            productName: product.name,
            productSku: product.sku,
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
            product_name: cartItem.name,
            product_sku: cartItem.sku,
            quantity: cartItem.quantity,
            unit_price_usd: cartItem.unitPriceUsd,
            total_price_usd: cartItem.totalPriceUsd,
            cost_usd_per_unit: costUsdPerUnit,
            is_weighted: product.isWeighted,
            unit: product.unit,
            created_at: now,
          } as unknown as Record<string, unknown>), tenantId);

          await syncQueue.enqueue('products', 'UPDATE', cartItem.productId, toSnake({ id: cartItem.productId, stock: newStock } as unknown as Record<string, unknown>), tenantId);
          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
        }

        const updatedCashReg = {
          ...cashReg,
          totalSalesCount: cashReg.totalSalesCount + 1,
          totalSalesBs: preciseRound(cashReg.totalSalesBs + totalBs, 2),
          totalIgtfBs: preciseRound(cashReg.totalIgtfBs + igtfBs, 2),
          updatedAt: now,
        };
        await db.cashRegisters.update(cashReg.id, {
          totalSalesCount: updatedCashReg.totalSalesCount,
          totalSalesBs: updatedCashReg.totalSalesBs,
          totalIgtfBs: updatedCashReg.totalIgtfBs,
          updatedAt: now,
        });

        await syncQueue.enqueue('cash_registers', 'UPDATE', cashReg.id, toSnake({
          id: cashReg.id,
          tenant_id: tenantUuid,
          total_sales_count: updatedCashReg.totalSalesCount,
          total_sales_bs: updatedCashReg.totalSalesBs,
          total_igtf_bs: updatedCashReg.totalIgtfBs,
          is_open: true,
          updated_at: now,
        } as unknown as Record<string, unknown>), tenantId);

        // Encolar en outbox DENTRO de la transacción (Regla #17)
        await outboxService.enqueue('SALE.COMPLETED', MODULE_NAME, {
          saleId,
          tenantSlug: tenantId,
          totalBs,
          paymentMethod,
          itemsCount: items.length,
          ...(discountBs > 0 && { discountBs, discountType, discountValue }),
        });
      });

      await emitWithAudit('SALE.COMPLETED', MODULE_NAME, {
        saleId,
        tenantSlug: tenantId,
        totalBs,
        paymentMethod,
        itemsCount: items.length,
      }, {
        userId,
        tenantId,
        tenantUuid,
      });

      // Push inmediato para que la venta llegue a la nube sin esperar el timer
      syncEngine.pushNow().catch(() => {});

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
      });
    } catch (err) {
      if (err instanceof AppError) return failure(err);
      logger.error('createSale', 'Error:', err);
      return failure(new AppError('SALE_TOTALS_MISMATCH', 'Error al completar la venta.'));
    }
  },

  async openCashRegister(input: OpenCashRegisterInput): Promise<Result<CashRegister, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    const { tenantId, userId, openingBalanceBs, openingRate } = input;

    // --- ROLE CHECK: Only owner or admin ---
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return failure(new AppError('AUTH_REQUIRED', 'Debe iniciar sesión para abrir la caja.'));
      
      const decoded = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const role = decoded.app_metadata?.role || decoded.role;
      
      if (role !== 'owner' && role !== 'admin') {
        return failure(new AppError('FORBIDDEN', 'Solo el dueño o administrador pueden abrir la caja.'));
      }
    } catch {
      return failure(new AppError('AUTH_ERROR', 'Error al verificar permisos.'));
    }

    if (!openingBalanceBs || openingBalanceBs <= 0) {
      return failure(new AppError(PosErrors.BOX_OPENING_BALANCE_REQUIRED, 'Debe ingresar un monto inicial para abrir la caja.'));
    }

    if (!openingRate || openingRate <= 0) {
      return failure(new AppError(PosErrors.BOX_OPENING_BALANCE_REQUIRED, 'No hay tasa de cambio disponible. Configure la tasa antes de abrir la caja.'));
    }


    const existing = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();

    if (existing) {
      const openedDate = existing.openedAt ? new Date(existing.openedAt) : null;
      if (openedDate && isSameDayVzla(openedDate, new Date())) {
        return failure(new AppError(PosErrors.BOX_ALREADY_OPEN, 'Ya existe una caja abierta para hoy.'));
      }
      await autoCloseRegister(db, existing, tenantId, userId);
    }

    // Option B: Una caja por día — no permitir abrir si ya se cerró una hoy
    const todayStart = startOfDayVzla();
    const todayEnd = endOfDayVzla();
    const todayClosed = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && !r.isOpen && r.openedAt != null && r.openedAt >= todayStart && r.openedAt <= todayEnd)
      .first();

    if (todayClosed) {
      // Permitir reabrir si la caja cerrada no tuvo ventas (cierre accidental)
      if (todayClosed.totalSalesCount === 0) {
        await db.cashRegisters.update(todayClosed.id, { deletedAt: new Date().toISOString() });
      } else {
        return failure(new AppError(PosErrors.BOX_CLOSED_TODAY, 'Ya hay un cierre de caja registrado para hoy. No puedes abrir otra caja el mismo día.'));
      }
    }

    // Verificar Supabase para evitar 409 en sync (siempre online por el guard de arriba)
    try {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      const { data: remoteRegister } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('tenant_id', tenantUuid)
        .is('deleted_at', null)
        .eq('is_open', true)
        .maybeSingle();

      if (remoteRegister) {
        await db.cashRegisters.put({
          id: remoteRegister.id as string,
          tenantId,
          isOpen: remoteRegister.is_open as boolean,
          openedBy: remoteRegister.opened_by as string | null,
          openedAt: remoteRegister.opened_at as string | null,
          openingBalanceBs: remoteRegister.opening_balance_bs as number | null,
          openingRate: remoteRegister.opening_rate as number | null,
          closedBy: remoteRegister.closed_by as string | null,
          closedAt: remoteRegister.closed_at as string | null,
          closingBalanceBs: remoteRegister.closing_balance_bs as number | null,
          closingRate: remoteRegister.closing_rate as number | null,
          expectedClosingBs: remoteRegister.expected_closing_bs as number | null,
          differenceBs: remoteRegister.difference_bs as number | null,
          totalSalesCount: remoteRegister.total_sales_count as number,
          totalSalesBs: remoteRegister.total_sales_bs as number,
          totalIgtfBs: remoteRegister.total_igtf_bs as number,
          createdAt: remoteRegister.created_at as string,
          updatedAt: remoteRegister.updated_at as string,
        });
        return failure(new AppError(PosErrors.BOX_ALREADY_OPEN, 'Ya existe una caja abierta en el servidor.'));
      }
    } catch {
      // Si falla la verificación remota, continuar con creación local
      // El sync fallará con 409 si hay conflicto, lo cual es recuperable
    }

    const id = generateId();
    const now = new Date().toISOString();
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

    try {
      const register = {
        id,
        tenantId,
        isOpen: true,
        openedBy: userId,
        openedAt: now,
        openingBalanceBs,
        openingRate,
        closedBy: null,
        closedAt: null,
        closingBalanceBs: null,
        closingRate: null,
        expectedClosingBs: null,
        differenceBs: null,
        totalSalesCount: 0,
        totalSalesBs: 0,
        totalIgtfBs: 0,
        createdAt: now,
        updatedAt: now,
      };

      await db.transaction('rw', [db.cashRegisters, db.syncQueue, db.outbox], async () => {
        await db.cashRegisters.add(register);

        await syncQueue.enqueue('cash_registers', 'CREATE', id, toSnake({
          id,
          tenant_id: tenantUuid,
          is_open: true,
          opened_by: userId,
          opened_at: now,
          opening_balance_bs: openingBalanceBs,
          opening_rate: openingRate,
          total_sales_count: 0,
          total_sales_bs: 0,
          total_igtf_bs: 0,
          created_at: now,
          updated_at: now,
        } as unknown as Record<string, unknown>), tenantId);

        await outboxService.enqueue('BOX.OPENED', MODULE_NAME, {
          registerId: id,
          tenantSlug: tenantId,
          openingBalanceBs,
          openedBy: userId,
        });
      });

      await emitWithAudit('BOX.OPENED', MODULE_NAME, {
        registerId: id,
        tenantSlug: tenantId,
        openingBalanceBs,
        openedBy: userId,
      }, {
        userId,
        tenantId,
        tenantUuid,
      });

      // Push inmediato para sincronizar apertura de caja a la nube
      syncEngine.pushNow().catch(() => {});

      return success({ ...register, deletedAt: null });
    } catch (err) {
      logger.error('openCashRegister', 'Error:', err);
      return failure(new AppError('BOX_ALREADY_OPEN', 'Error al abrir la caja.'));
    }
  },

  async getSalesHistory(
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
        .filter((r) => !r.deletedAt && r.status === 'completed')
        .toArray();

      const total = localSales.length;

      if (total === 0) {
        const uuid = await TenantTranslator.slugToUuid(tenantId);
        const { data } = await supabase
          .from('sales')
          .select('*')
          .eq('tenant_id', uuid)
          .is('deleted_at', null)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(50);

        if (data) {
          for (const sale of data) {
            await db.sales.put({
              id: sale.id as string,
              tenantId,
              userId: sale.user_id as string,
              paymentMethod: sale.payment_method as string,
              subtotalBs: sale.subtotal_bs as number,
              igtfBs: sale.igtf_bs as number,
              ivaBs: sale.iva_bs !== undefined ? (sale.iva_bs as number) : 0,
              totalBs: sale.total_bs as number,
              exchangeRate: sale.exchange_rate as number,
              status: sale.status as string,
              voidedAt: sale.voided_at as string | undefined,
              createdAt: sale.created_at as string,
              deletedAt: sale.deleted_at as string | undefined,
            });
          }
        }
      }

      let filtered = localSales;
      if (startDate) {
        const start = new Date(startDate);
        filtered = filtered.filter((r) => new Date(r.createdAt) >= start);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter((r) => new Date(r.createdAt) <= end);
      }

      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const paged = filtered.slice(offset, offset + limit);

      return success({
        total: filtered.length,
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
        })),
      });
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getSalesHistory:', err);
      return failure(new AppError('SALES_HISTORY_FETCH_FAILED', 'Error al cargar historial de ventas.'));
    }
  },

  async getSaleItems(saleId: string): Promise<Result<SaleItem[], AppError>> {
    try {
      const db = getDb();
      let rows = await db.saleItems
        .where({ saleId })
        .filter((r) => !r.deletedAt)
        .toArray();

      if (rows.length === 0) {
        const { data } = await supabase
          .from('sale_items')
          .select('*')
          .eq('sale_id', saleId);

        if (data) {
          for (const item of data) {
            await db.saleItems.put({
              id: item.id as string,
              tenantId: item.tenant_id as string,
              saleId: item.sale_id as string,
              productId: item.product_id as string,
              productName: item.product_name as string,
              productSku: item.product_sku as string,
              quantity: item.quantity as number,
              unitPriceUsd: item.unit_price_usd as number,
              totalPriceUsd: item.total_price_usd as number,
              costUsdPerUnit: item.cost_usd_per_unit as number | undefined,
              isWeighted: item.is_weighted as boolean,
              unit: item.unit as string,
              presentationId: item.presentation_id as string | undefined,
              presentationName: item.presentation_name as string | undefined,
              unitMultiplier: (item.unit_multiplier as number) ?? 1,
              createdAt: item.created_at as string,
            });
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
  },

  async voidSale(saleId: string, tenantId: string, userId: string): Promise<Result<void, AppError>> {
    try {
      const db = getDb();
      const sale = await db.sales.get(saleId);
      if (!sale || sale.status !== 'completed') {
        return failure(new AppError(PosErrors.SALE_TOTALS_MISMATCH, 'Venta no encontrada o ya anulada.'));
      }

      // Solo permitir anular ventas del día actual
      const saleDate = new Date(sale.createdAt);
      if (!isSameDayVzla(saleDate, new Date())) {
        return failure(new AppError(PosErrors.SALE_TOTALS_MISMATCH, 'Solo se pueden anular ventas del día actual.'));
      }

      const items = await db.saleItems.where({ saleId }).toArray();
      const now = new Date().toISOString();
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

      // Buscar caja abierta para revertir totales
      const cashReg = await db.cashRegisters
        .where({ tenantId })
        .filter((r) => !r.deletedAt && r.isOpen)
        .first();

      await db.transaction('rw', [db.sales, db.saleItems, db.products, db.inventoryMovements, db.inventoryLots, db.cashRegisters, db.syncQueue, db.outbox], async () => {
        await db.sales.update(saleId, { status: 'voided', voidedAt: now });

        for (const item of items) {
          const product = await db.products.get(item.productId);
          if (!product || product.deletedAt) continue;

          const previousStock = product.stock;
          const storageQty = product.isWeighted
            ? convertToStorage(item.quantity, product.unit === 'lt' ? 'pesable_lt' : 'pesable_kg')
            : Math.round(item.quantity);
          const newStock = previousStock + storageQty;
          await db.products.update(item.productId, { stock: newStock });

          const lots = await db.inventoryLots
            .where({ productId: item.productId })
            .filter((l) => l.remainingQuantity >= 0)
            .toArray();
          lots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

          let toRestore = storageQty;
          for (const lot of lots) {
            if (toRestore <= 0) break;
            const currentLot = await db.inventoryLots.get(lot.id);
            if (!currentLot) continue;
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

        // Revertir totales de caja si existe una caja abierta
        if (cashReg) {
          const updatedCashReg = {
            ...cashReg,
            totalSalesCount: Math.max(0, cashReg.totalSalesCount - 1),
            totalSalesBs: preciseRound(Math.max(0, cashReg.totalSalesBs - sale.totalBs), 2),
            totalIgtfBs: preciseRound(Math.max(0, cashReg.totalIgtfBs - sale.igtfBs), 2),
            updatedAt: now,
          };
          await db.cashRegisters.update(cashReg.id, {
            totalSalesCount: updatedCashReg.totalSalesCount,
            totalSalesBs: updatedCashReg.totalSalesBs,
            totalIgtfBs: updatedCashReg.totalIgtfBs,
            updatedAt: now,
          });

          await syncQueue.enqueue('cash_registers', 'UPDATE', cashReg.id, toSnake({
            id: cashReg.id,
            tenant_id: tenantUuid,
            total_sales_count: updatedCashReg.totalSalesCount,
            total_sales_bs: updatedCashReg.totalSalesBs,
            total_igtf_bs: updatedCashReg.totalIgtfBs,
            updated_at: now,
          } as unknown as Record<string, unknown>), tenantId);
        }

        await outboxService.enqueue('SALE.VOIDED', MODULE_NAME, { saleId, tenantSlug: tenantId });

        await syncQueue.enqueue('sales', 'UPDATE', saleId, toSnake({
          id: saleId, tenant_id: tenantUuid, status: 'voided', voided_at: now,
        } as unknown as Record<string, unknown>), tenantId);
      });

      await emitWithAudit('SALE.VOIDED', MODULE_NAME, { saleId, tenantSlug: tenantId }, { userId, tenantId, tenantUuid });
      return success(undefined);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en voidSale:', err);
      return failure(new AppError('SALE_VOID_FAILED', 'Error al anular la venta.'));
    }
  },

  async closeCashRegister(input: CloseCashRegisterInput): Promise<Result<CashRegister, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    const { tenantId, userId, declaredClosingBalanceBs, closingRate } = input;

    // --- ROLE CHECK: Only owner or admin ---
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return failure(new AppError('AUTH_REQUIRED', 'Debe iniciar sesión para cerrar la caja.'));
      
      const decoded = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const role = decoded.app_metadata?.role || decoded.role;
      
      if (role !== 'owner' && role !== 'admin') {
        return failure(new AppError('FORBIDDEN', 'Solo el dueño o administrador pueden cerrar la caja.'));
      }
    } catch {
      return failure(new AppError('AUTH_ERROR', 'Error al verificar permisos.'));
    }


    const cashReg = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();

    if (!cashReg) {
      return failure(new AppError(PosErrors.BOX_ALREADY_CLOSED, 'La caja ya esta cerrada.'));
    }

    const now = new Date().toISOString();
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

    const expectedClosingBs = preciseRound(
      (cashReg.openingBalanceBs ?? 0) + cashReg.totalSalesBs,
      2,
    );

    const differenceBs = preciseRound(declaredClosingBalanceBs - expectedClosingBs, 2);

    try {
      await db.transaction('rw', [db.cashRegisters, db.syncQueue, db.outbox], async () => {
        await db.cashRegisters.update(cashReg.id, {
          isOpen: false,
          closedBy: userId,
          closedAt: now,
          closingBalanceBs: declaredClosingBalanceBs,
          closingRate,
          expectedClosingBs,
          differenceBs,
          updatedAt: now,
        });

        await syncQueue.enqueue('cash_registers', 'UPDATE', cashReg.id, toSnake({
          id: cashReg.id,
          tenant_id: tenantUuid,
          is_open: false,
          closed_by: userId,
          closed_at: now,
          closing_balance_bs: declaredClosingBalanceBs,
          closing_rate: closingRate,
          expected_closing_bs: expectedClosingBs,
          difference_bs: differenceBs,
          total_sales_count: cashReg.totalSalesCount,
          total_sales_bs: cashReg.totalSalesBs,
          total_igtf_bs: cashReg.totalIgtfBs,
          updated_at: now,
        } as unknown as Record<string, unknown>), tenantId);

        await outboxService.enqueue('BOX.CLOSED', MODULE_NAME, {
          registerId: cashReg.id,
          tenantSlug: tenantId,
          expectedBs: expectedClosingBs,
          declaredBs: declaredClosingBalanceBs,
          differenceBs,
        });
      });

      await emitWithAudit('BOX.CLOSED', MODULE_NAME, {
        registerId: cashReg.id,
        tenantSlug: tenantId,
        expectedBs: expectedClosingBs,
        declaredBs: declaredClosingBalanceBs,
        differenceBs,
      }, {
        userId,
        tenantId,
        tenantUuid,
      });

      // Push inmediato para sincronizar cierre de caja a la nube
      syncEngine.pushNow().catch(() => {});

      return success({
        id: cashReg.id,
        tenantId: cashReg.tenantId,
        isOpen: false,
        openedBy: cashReg.openedBy,
        openedAt: cashReg.openedAt,
        openingBalanceBs: cashReg.openingBalanceBs,
        openingRate: cashReg.openingRate,
        closedBy: userId,
        closedAt: now,
        closingBalanceBs: declaredClosingBalanceBs,
        closingRate,
        expectedClosingBs,
        differenceBs,
        totalSalesCount: cashReg.totalSalesCount,
        totalSalesBs: cashReg.totalSalesBs,
        totalIgtfBs: cashReg.totalIgtfBs,
        createdAt: cashReg.createdAt,
        updatedAt: now,
        deletedAt: null,
      });
    } catch (err) {
      logger.error('closeCashRegister', 'Error:', err);
      return failure(new AppError('BOX_ALREADY_CLOSED', 'Error al cerrar la caja.'));
    }
  },

  // ===== PARKED CARTS =====

  async getParkedCarts(tenantId: string): Promise<Result<import('../types').ParkedCart[], AppError>> {
    try {
      const db = getDb();
      const rows = await db.parkedCarts
        .where({ tenantId })
        .sortBy('createdAt');
      return success(rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        name: r.name,
        cart: JSON.parse(r.cartJson) as import('../types').CartItem[],
        createdAt: r.createdAt,
      })));
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getParkedCarts:', err);
      return failure(new AppError('PARKED_CARTS_FETCH_FAILED', 'Error al cargar ventas en cola.'));
    }
  },

  async parkCart(tenantId: string, name: string, cart: import('../types').CartItem[]): Promise<Result<string, AppError>> {
    try {
      const db = getDb();
      const existingCount = await db.parkedCarts.where({ tenantId }).count();
      if (existingCount >= 10) {
        return failure(new AppError('CART_ITEM_WEIGHT_REQUIRED', 'Máximo 10 ventas en cola. Completa o elimina una.'));
      }
      const id = generateId();
      await db.parkedCarts.add({
        id, tenantId,
        name: name.trim() || `Venta #${existingCount + 1}`,
        cartJson: JSON.stringify(cart),
        createdAt: new Date().toISOString(),
      });
      return success(id);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en parkCart:', err);
      return failure(new AppError('PARKED_CART_SAVE_FAILED', 'Error al guardar venta en cola.'));
    }
  },

  async deleteParkedCart(id: string): Promise<Result<void, AppError>> {
    try {
      const db = getDb();
      await db.parkedCarts.delete(id);
      return success(undefined);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en deleteParkedCart:', err);
      return failure(new AppError('PARKED_CART_DELETE_FAILED', 'Error al eliminar venta en cola.'));
    }
  },

  // ===== FAVORITES =====

  getFavoritesStorageKey(tenantId: string): string {
    return `sasa-favorites-${tenantId}`;
  },

  async persistFavoritesToStorage(tenantId: string): Promise<void> {
    try {
      const db = getDb();
      const favs = await db.productFavorites.where({ tenantId }).toArray();
      localStorage.setItem(`sasa-favorites-${tenantId}`, JSON.stringify(favs.map((f) => f.productId)));
    } catch {
      // Silencioso: si la DB se está cerrando, ignoramos
    }
  },

  async toggleFavorite(tenantId: string, productId: string): Promise<Result<boolean, AppError>> {
    try {
      const db = getDb();
      const existing = await db.productFavorites.get([productId, tenantId]);
      if (existing) {
        await db.productFavorites.delete([productId, tenantId]);
        await this.persistFavoritesToStorage(tenantId);
        return success(false);
      }
      await db.productFavorites.add({ productId, tenantId, createdAt: new Date().toISOString() });
      await this.persistFavoritesToStorage(tenantId);
      return success(true);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en toggleFavorite:', err);
      return failure(new AppError('FAVORITE_TOGGLE_FAILED', 'Error al cambiar favorito.'));
    }
  },

  async getFavorites(tenantId: string): Promise<Result<Set<string>, AppError>> {
    try {
      const db = getDb();
      let favs = await db.productFavorites.where({ tenantId }).toArray();

      if (favs.length === 0) {
        const stored = localStorage.getItem(`sasa-favorites-${tenantId}`);
        if (stored) {
          try {
            const productIds: string[] = JSON.parse(stored);
            for (const pid of productIds) {
              await db.productFavorites.add({ productId: pid, tenantId, createdAt: new Date().toISOString() });
            }
            favs = await db.productFavorites.where({ tenantId }).toArray();
          } catch {
            // Silencioso: datos corruptos en localStorage
          }
        }
      }

      return success(new Set(favs.map((f) => f.productId)));
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getFavorites:', err);
      return failure(new AppError('FAVORITES_FETCH_FAILED', 'Error al cargar favoritos.'));
    }
  },

  async getTodaySoldProducts(
    tenantId: string,
    maxProducts = 10,
  ): Promise<Result<Array<{ productId: string; productName: string; productSku: string; quantity: number }>, AppError>> {
    try {
      const todayStart = startOfDayVzla();
      const todayEnd = endOfDayVzla();

      const salesResult = await this.getSalesHistory(tenantId, 0, 1000, todayStart, todayEnd);
      if (!salesResult.ok) return failure(salesResult.error);

      const productMap = new Map<string, { productId: string; productName: string; productSku: string; quantity: number }>();

      for (const sale of salesResult.data.sales) {
        const itemsResult = await this.getSaleItems(sale.id);
        if (!itemsResult.ok) continue;
        for (const item of itemsResult.data) {
          const existing = productMap.get(item.productId);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            productMap.set(item.productId, {
              productId: item.productId,
              productName: item.productName,
              productSku: item.productSku,
              quantity: item.quantity,
            });
          }
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
  },
};
