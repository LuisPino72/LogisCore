import { type Result, success, failure, AppError, SystemEvents } from '@logiscore/core';
import { preciseRound, toSnake, generateId, MAX_CENTS_DIFFERENCE } from '@logiscore/shared';
import { productionService, recipeQtyToStorageBase } from '../../production/services/productionService';
import { getDb, isDbClosing } from '../../../services/dexie/db';
import type { DexieCashRegister, LogisCoreDB } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { syncEngine } from '../../../services/sync/syncEngine';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { isSameDayVzla, startOfDayVzla, endOfDayVzla } from '../../../lib/date';
import { PosErrors } from '../../../specs/pos/errors';
import { InventoryErrors } from '../../../specs/inventory/errors';
import { CreateSaleInputSchema, calculateSaleTotals, MAX_PARKED_CARTS } from '../../../specs/pos';
import { saleFromSupabase, saleItemFromSupabase, cashRegisterFromSupabase } from './mappers';
import type { Sale, SaleItem, CashRegister, CreateSaleInput, OpenCashRegisterInput, CloseCashRegisterInput, PaymentMethod } from '../types';
import type { Product } from '../../../specs/inventory';
import { convertToStorage } from '../../../features/inventory/types';
import { requireRole } from '../../auth/services/roleGuard';
import { useAuthStore } from '../../auth/stores/authStore';

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

const MODULE_NAME = 'POS';

// POS-002 (M-13): defense-in-depth — filtra lotIds huérfanos antes de sync
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

  await db.transaction('rw', [db.cashRegisters, db.syncQueue, db.outbox], async (tx) => {
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

    await outboxService.enqueue(SystemEvents.BOX_CLOSED, MODULE_NAME, {
      registerId: register.id,
      tenantSlug: tenantId,
      expectedBs: expectedClosingBs,
      declaredBs: expectedClosingBs,
      differenceBs: 0,
      autoClosed: true,
    }, tx);
  });

  await logAuditEventOnly({
    eventName: SystemEvents.BOX_CLOSED,
    module: MODULE_NAME,
    payload: {
      registerId: register.id,
      tenantSlug: tenantId,
      expectedBs: expectedClosingBs,
      declaredBs: expectedClosingBs,
      differenceBs: 0,
      autoClosed: true,
    },
    context: {
      userId,
      tenantId,
      tenantUuid,
    },
  });

  // Push inmediato para sincronizar cierre automático a la nube
  syncEngine.pushNow().catch((err) => logger.warn(MODULE_NAME, 'pushNow failed (autoClose):', err));
}

export const posService = {
  /**
   * Obtiene la caja registradora actual del tenant.
   *
   * Patrón cache-first: Lee de Dexie (offline) primero.
   * Si no hay datos locales, consulta Supabase como fallback.
   * Los datos remotos se copian a Dexie para futuras consultas.
   *
   * ⚠️ Nota: Si el usuario está offline y no hay datos locales,
   * la función retornará null (no error).
   */
  async getOpenCashRegister(tenantId: string): Promise<Result<CashRegister | null, AppError>> {
    try {
      const db = getDb();

      let row = await db.cashRegisters
        .where({ tenantId })
        .filter((r) => !r.deletedAt && r.isOpen)
        .first();

      if (!row) {
        if (!navigator.onLine) return success(null);

        const uuid = await TenantTranslator.slugToUuid(tenantId);
        const { data } = await supabase
          .from('cash_registers')
          .select('*')
          .eq('tenant_id', uuid)
          .is('deleted_at', null)
          .eq('is_open', true)
          .maybeSingle();

        if (data) {
          const result = cashRegisterFromSupabase(data, tenantId);
          if (result.ok) {
            row = result.data;
            // POS-002 (M-6): skip remote put si hay pending/failed local — evita overwrite
            const pendingCount = await db.syncQueue
              .where('recordId').equals(row!.id)
              .filter((i) => i.status === 'pending' || i.status === 'failed')
              .count();
            if (pendingCount === 0 && row) {
              await db.cashRegisters.put(row);
            }
          }
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
      logger.error(MODULE_NAME, 'Error en getOpenCashRegister:', err);
      return failure(new AppError(PosErrors.BOX_QUERY_FAILED, 'Error al consultar el estado de la caja.'));
    }
  },

  async getLastClosedCashRegister(tenantId: string): Promise<Result<CashRegister | null, AppError>> {
    try {
      const db = getDb();
      let row = await db.cashRegisters
        .where({ tenantId })
        .filter((r) => !r.deletedAt && !r.isOpen)
        .reverse()
        .first();

      if (!row && navigator.onLine) {
        const uuid = await TenantTranslator.slugToUuid(tenantId);
        const { data } = await supabase
          .from('cash_registers')
          .select('*')
          .eq('tenant_id', uuid)
          .is('deleted_at', null)
          .eq('is_open', false)
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
        }
      }

      if (!row) return success(null);
      return success({
        id: row.id, tenantId: row.tenantId, isOpen: row.isOpen,
        openedBy: row.openedBy, openedAt: row.openedAt,
        openingBalanceBs: row.openingBalanceBs, openingRate: row.openingRate,
        closedBy: row.closedBy, closedAt: row.closedAt,
        closingBalanceBs: row.closingBalanceBs, closingRate: row.closingRate,
        expectedClosingBs: row.expectedClosingBs, differenceBs: row.differenceBs,
        totalSalesCount: row.totalSalesCount, totalSalesBs: row.totalSalesBs,
        totalIgtfBs: row.totalIgtfBs,
        createdAt: row.createdAt, updatedAt: row.updatedAt,
        deletedAt: row.deletedAt ?? null,
      });
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getLastClosedCashRegister:', err);
      return failure(new AppError(PosErrors.BOX_QUERY_FAILED, 'Error al consultar la última caja cerrada.'));
    }
  },

  /**
   * Obtiene productos disponibles para venta.
   *
   * Patrón cache-first: Lee de Dexie (offline) primero.
   * Si no hay datos locales, consulta Supabase como fallback.
   * Los datos remotos se copian a Dexie para futuras consultas.
   *
   * ⚠️ Nota: Si el usuario está offline y no hay datos locales,
   * la función retornará un array vacío (no error).
   */
  async getProductsForSale(tenantId: string): Promise<Result<Product[], AppError>> {
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
          if (p.deletedAt || p.isSellable === false) return false;
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
            // DB cerrada durante shutdown, ignorar
          }

          // También seedear recetas desde Supabase (importante para assembly products con stock=0)
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
              // Recargar recetas locales y reconstruir assemblyProductIds
              allRecipes = await db.recipes.toArray();
              assemblyProductIds = new Set(
                allRecipes
                  .filter(r => !r.deletedAt && r.isActive && r.mode === 'assembly')
                  .map(r => r.productId)
              );
            }
          } catch {
            // DB cerrada durante shutdown, ignorar
          }

          rows = await db.products
            .where({ tenantId })
            .filter((p) => {
              if (p.deletedAt || p.isSellable === false) return false;
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
  },

  async createSale(input: CreateSaleInput): Promise<Result<Sale, AppError>> {
    const db = getDb();
    const { tenantId, userId, paymentMethod, items, exchangeRate } = input;

    const cashReg = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();

    if (!cashReg) {
      return failure(new AppError(PosErrors.SALE_BOX_CLOSED, 'La caja está cerrada. Ábrala para realizar ventas.'));
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
      return failure(new AppError(PosErrors.SALE_TOTALS_MISMATCH, 'Datos de venta inválidos: ' + parsed.error.issues.map((e: { message: string }) => e.message).join(', ')));
    }

    // Validate item coherence: totalPriceUsd must equal quantity * unitPriceUsd (tolerance 0.01)
    for (const item of items) {
      const expected = preciseRound(item.quantity * item.unitPriceUsd, 2);
      const diff = Math.abs(item.totalPriceUsd - expected);
      if (diff > 0.01) {
        return failure(new AppError(PosErrors.SALE_TOTALS_MISMATCH, `Inconsistencia en "${item.name}": precio total no coincide con cantidad × precio unitario.`));
      }
    }

    // PLAN-112 (M6): si la venta referencia un cliente, verificar que no este soft-deleted.
    // Si el cliente fue eliminado lógicamente, NO permitimos asociar la venta (evita
    // registrar ventas contra clientes "zombie" que ya no existen en la UI).
    if (input.customerId) {
      const customer = await db.customers
        .where({ id: input.customerId })
        .filter((c) => c.tenantId === tenantId)
        .first();
      if (!customer || customer.deletedAt) {
        return failure(new AppError(PosErrors.SALE_CUSTOMER_UNAVAILABLE, 'Cliente no disponible. Seleccione otro cliente o venda sin cliente.'));
      }
    }

    // Validaciones de crédito (solo si paymentMethod === 'credito')
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
      // Pre-validate credit limit (will be re-validated inside transaction for concurrency)
      const pendingCreditTotal = await db.sales
        .where({ tenantId })
        .filter((s) => !s.deletedAt && s.status === 'completed' && s.isCreditSale === true && !s.creditCollected && s.customerId === input.customerId)
        .toArray();
      const currentDebt = pendingCreditTotal.reduce((sum, s) => sum + s.totalUsd, 0);
      // We'll use the totals calculated below, but we need a rough estimate here for pre-validation
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
    );
    // POS-002 (C-6): destructurar también USD para persistir
    const { subtotalBs, igtfBs, ivaBs, discountBs, subtotalUsd, ivaUsd, totalUsd, discountUsd } = totals;
    // igtfUsd no viene en SaleTotals (es implícito), lo calculamos
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

    // Identificar items assembly vs normales
    const assemblyItems: Array<{ productId: string; quantity: number; productName?: string; presentationId?: string; presentationName?: string }> = [];
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
        // Re-validate credit limit inside transaction (concurrency defense)
        if (isCreditSale && input.customerId) {
          const txCustomer = await db.customers.get(input.customerId);
          if (!txCustomer || txCustomer.deletedAt) {
            throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente no encontrado.');
          }
          const pendingSales = await db.sales
            .where({ tenantId })
            .filter((s) => !s.deletedAt && s.status === 'completed' && s.isCreditSale === true && !s.creditCollected && s.customerId === input.customerId)
            .toArray();
          const currentDebt = pendingSales.reduce((sum, s) => sum + s.totalUsd, 0);
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
          // POS-002 (C-6): persistir USD
          subtotalUsd,
          ivaUsd,
          igtfUsd,
          totalUsd,
          discountUsd: discountUsd > 0 ? discountUsd : undefined,
          // Sistema de crédito
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
          // POS-002 (C-6): USD persistidos para sync
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
            ? convertToStorage(cartItem.quantity, product.unit === 'lt' ? 'pesable_lt' : 'pesable_kg')
            : Math.round(cartItem.quantity);
          const storageQuantity = baseQuantity * (cartItem.unitMultiplier || 1);

          if (product.stock < storageQuantity) {
            throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Stock insuficiente para "${product.name}". Disponible: ${product.stock}.`);
          }

          let toConsume = storageQuantity;
          let totalCostUsd = 0;
          const consumedLots: Array<{ lotId: string; quantity: number }> = []; // AUDIT-012: FIFO restore (track original lot consumption)
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
            // Optimistic locking: re-read version before update
            const currentLot = await db.inventoryLots.get(lot.id);
            if (!currentLot || currentLot.remainingQuantity <= 0) continue;
            if (currentLot.version !== undefined && lot.version !== undefined && currentLot.version !== lot.version) {
              throw new AppError(InventoryErrors.INVENTORY_LOT_FIFO_CONFLICT, 'Conflicto de inventario concurrente. Reintente la operación.');
            }
            const lotCost = currentLot.costUsdPerUnit ?? 0;
            const newVersion = (currentLot.version ?? 0) + 1;
            if (currentLot.remainingQuantity >= toConsume) {
              // AUDIT-FLOW-10-010D: totalCostUsd acumulado con preciseRound (Regla #6).
              totalCostUsd = preciseRound(totalCostUsd + toConsume * lotCost, 2);
              consumedLots.push({ lotId: lot.id, quantity: toConsume }); // AUDIT-012
              await db.inventoryLots.update(lot.id, { remainingQuantity: currentLot.remainingQuantity - toConsume, version: newVersion });
              await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({ ...lot, remainingQuantity: currentLot.remainingQuantity - toConsume, version: newVersion } as unknown as Record<string, unknown>), tenantId);
              toConsume = 0;
            } else {
              totalCostUsd = preciseRound(totalCostUsd + currentLot.remainingQuantity * lotCost, 2);
              consumedLots.push({ lotId: lot.id, quantity: currentLot.remainingQuantity }); // AUDIT-012
              toConsume -= currentLot.remainingQuantity;
              await db.inventoryLots.update(lot.id, { remainingQuantity: 0, version: newVersion });
              await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({ ...lot, remainingQuantity: 0, version: newVersion } as unknown as Record<string, unknown>), tenantId);
            }
          }

          if (toConsume > 0) {
            throw new AppError(PosErrors.SALE_STOCK_INSUFFICIENT, `Stock insuficiente para "${product.name}" (lotes agotados).`);
          }

          // Re-leer stock fresco para evitar race condition entre transacciones concurrentes
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
            consumedLots, // AUDIT-012: FIFO restore (track original lot consumption)
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
            presentation_id: cartItem.presentationId ?? null, // POS-001-01: FK to product_presentations must be populated
            presentation_name: cartItem.presentationName ?? null,
            unit_multiplier: cartItem.unitMultiplier ?? 1,
            consumed_lots: (await filterOrphanLots(consumedLots)).length > 0 ? await filterOrphanLots(consumedLots) : null, // POS-002 (M-13) + AUDIT-017-DB / CRIT-DB-003
            created_at: now,
          } as unknown as Record<string, unknown>), tenantId);

          await syncQueue.enqueue('products', 'UPDATE', cartItem.productId, toSnake({ id: cartItem.productId, stock: newStock } as unknown as Record<string, unknown>), tenantId);
          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
        }

        // Crear saleItems para items assembly (consumo de ingredientes dentro de transacción) // AUDIT-FLOW-2-001
        for (const assemblyItem of assemblyItems) {
          const result = await productionService.consumeForAssembly(
            assemblyItem.productId,
            assemblyItem.quantity,
            tenantId,
            userId,
            { allowOverride: input.allowOverride }
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
            unitMultiplier: 1,
            createdAt: now,
            consumedLots, // AUDIT-012: FIFO restore (ingredient lots consumed)
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
            consumed_lots: (await filterOrphanLots(consumedLots)).length > 0 ? await filterOrphanLots(consumedLots) : null, // POS-002 (M-13) + AUDIT-017-DB / CRIT-DB-003
            created_at: now,
          } as unknown as Record<string, unknown>), tenantId);
        }

        // Skip cash register update for credit sales (money hasn't entered the register)
        if (!isCreditSale) {
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
        }

        // Update customer balance for credit sales
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

        // Encolar en outbox DENTRO de la transacción (Regla #17)
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


      // Push inmediato para que la venta llegue a la nube sin esperar el timer
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
        // POS-002 (C-6): USD persistidos retornados al caller
        subtotalUsd,
        ivaUsd,
        igtfUsd,
        totalUsd,
        discountUsd: discountUsd > 0 ? discountUsd : undefined,
        // Sistema de crédito
        isCreditSale,
        creditCollected: false,
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

    requireRole('owner', 'admin');

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

      await db.transaction('rw', [db.cashRegisters, db.syncQueue, db.outbox], async (tx) => {
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

        await outboxService.enqueue(SystemEvents.BOX_OPENED, MODULE_NAME, {
          registerId: id,
          tenantSlug: tenantId,
          openingBalanceBs,
          openedBy: userId,
        }, tx);
      });

      await logAuditEventOnly({
        eventName: SystemEvents.BOX_OPENED,
        module: MODULE_NAME,
        payload: { registerId: id, tenantSlug: tenantId, openingBalanceBs, openedBy: userId },
        context: { userId, tenantId, tenantUuid },
      });


      // Push inmediato para sincronizar apertura de caja a la nube
      syncEngine.pushNow().catch((err) => logger.warn(MODULE_NAME, 'pushNow failed (openCash):', err));

      return success({ ...register, deletedAt: null });
    } catch (err) {
      // POS-002 (C-8): detectar unique violation de uq_cash_registers_one_open_per_tenant
      // y re-leer la caja abierta existente. Dexie expone el nombre del failing index
      // en `err.name` o `err.message` con texto "uq_cash_registers_one_open_per_tenant".
      const errName = (err as { name?: string })?.name ?? '';
      const errMsg = err instanceof Error ? err.message : String(err);
      const isUniqueViolation =
        errName === 'ConstraintError' ||
        errMsg.includes('uq_cash_registers_one_open_per_tenant');

      if (isUniqueViolation) {
        // Race condition: otro dispositivo creó la caja entre nuestro check y add.
        // Re-leer y retornar la existente (idempotente).
        const existingRemote = await db.cashRegisters
          .where({ tenantId })
          .filter((r) => !r.deletedAt && r.isOpen)
          .first();
        if (existingRemote) {
          logger.warn(MODULE_NAME, 'C-8: openCashRegister race detected, returning existing register', { id: existingRemote.id });
          return success({ ...existingRemote });
        }
      }

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
        .filter((r) => {
          if (r.deletedAt || r.status !== 'completed') return false;
          if (startDate) {
            const saleDate = new Date(r.createdAt);
            if (saleDate < new Date(startDate)) return false;
          }
          if (endDate) {
            const saleDate = new Date(r.createdAt);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (saleDate > end) return false;
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
          query = query.gte('created_at', startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query = query.lte('created_at', end.toISOString());
        }

        const { data } = await query;

        if (data) {
          for (const raw of data) {
            const result = saleFromSupabase(raw, tenantId);
            if (!result.ok) continue; // POS-002 (M-1): skip malformed rows
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
          // Sistema de crédito
          isCreditSale: r.isCreditSale ?? false,
          creditCollected: r.creditCollected ?? false,
          collectedAt: r.collectedAt ?? undefined,
        })),
      });
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getSalesHistory:', err);
      return failure(new AppError('SALES_HISTORY_FETCH_FAILED', 'Error al cargar historial de ventas.'));
    }
  },

  async getSaleItems(tenantId: string, saleId: string): Promise<Result<SaleItem[], AppError>> {
    try {
      const db = getDb();
      let rows = await db.saleItems
        .where({ saleId })
        .filter((r) => !r.deletedAt)
        .toArray();

      if (rows.length === 0) {
        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        // AUDIT-009: Fail-closed on missing tenantUuid — antes caía a query sin filtro (multi-tenant leak)
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
            if (!result.ok) continue; // POS-002 (M-1): skip malformed rows
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
  },

  async voidSale(saleId: string, tenantId: string, userId: string): Promise<Result<void, AppError>> {
    requireRole('owner', 'admin');

    try {
      const db = getDb();
      const session = useAuthStore.getState().session;
      const sale = await db.sales.where({ id: saleId, tenantId: session?.tenantId }).first();
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

      // Credit sale void validation
      if (sale.isCreditSale) {
        if (sale.creditCollected) {
          return failure(new AppError('CREDIT_SALE_PARTIALLY_COLLECTED', 'No se puede anular una venta a crédito que ya fue cobrada parcialmente. Contacte al administrador.'));
        }
      }

      // Buscar caja que estaba abierta al momento de la venta (no la que está abierta ahora)
      const saleTs = new Date(sale.createdAt).getTime();
      const allRegisters = await db.cashRegisters
        .where({ tenantId })
        .filter((r) => !r.deletedAt)
        .toArray();
      const cashReg = allRegisters.find((r) => {
        const opened = r.openedAt ? new Date(r.openedAt).getTime() : 0;
        const closed = r.closedAt ? new Date(r.closedAt).getTime() : Infinity;
        return opened <= saleTs && (r.isOpen || closed >= saleTs);
      }) ?? allRegisters.find((r) => r.isOpen);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txTables: any[] = [db.sales, db.saleItems, db.products, db.inventoryMovements, db.inventoryLots, db.cashRegisters, db.recipes, db.recipeLines, db.syncQueue, db.outbox];
      if (sale.isCreditSale && sale.customerId) txTables.push(db.customers);

      await db.transaction('rw', txTables, async (tx) => {
        await db.sales.update(saleId, { status: 'voided', voidedAt: now });

        for (const item of items) {
          const product = await db.products.where({ id: item.productId, tenantId }).first();
          if (!product || product.deletedAt) continue;

          // Detectar si es producto assembly
          const assemblyRecipe = await db.recipes
            .where({ productId: item.productId, mode: 'assembly' as const })
            .filter(r => !r.deletedAt && r.isActive)
            .first();

          if (assemblyRecipe) {
            // C1: Revertir ingredientes en vez del producto terminado
            const recipeLines = await db.recipeLines
              .where({ recipeId: assemblyRecipe.id })
              .filter(l => !l.deletedAt)
              .toArray();

            const wasteMultiplier = 1 + (assemblyRecipe.wastePct / 100);

            // AUDIT-012: FIFO restore (track original lot consumption)
            // Si tenemos consumedLots de la venta original, restaurar exactamente esos lotes.
            // Si no (ventas legacy pre-AUDIT-012), fallback a la lógica antigua.
            const hasConsumedLots = item.consumedLots && item.consumedLots.length > 0; // AUDIT-012
            const restoredByProduct = new Map<string, number>(); // AUDIT-012: productId -> total restaurado

            if (hasConsumedLots) {
              // AUDIT-012: Restaurar a los lotes ORIGINALES consumidos (no a los más recientes)
              for (const { lotId, quantity } of item.consumedLots!) {
                const currentLot = await db.inventoryLots.get(lotId);
                if (!currentLot) continue;
                const cap = currentLot.quantityAdded - currentLot.remainingQuantity; // no over-restore
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

              const needed = Math.ceil(recipeQtyToStorageBase(line.quantity * item.quantity * wasteMultiplier, line.unit, ingredient.unit));
              const previousStock = ingredient.stock;
              // AUDIT-012: usar lo realmente restaurado por lotes si tenemos tracking, sino fallback a `needed`
              const restoredForThisIngredient = hasConsumedLots
                ? (restoredByProduct.get(line.productId) ?? 0)
                : needed;
              const newStock = previousStock + restoredForThisIngredient;

              await db.products.update(line.productId, { stock: newStock });
              await syncQueue.enqueue('products', 'UPDATE', line.productId, toSnake({ ...ingredient, stock: newStock } as unknown as Record<string, unknown>), tenantId);

              if (!hasConsumedLots) {
                // Fallback legacy: restaurar lotes más recientes primero (ventas pre-AUDIT-012)
                const ingredientLots = await db.inventoryLots
                  .where({ productId: line.productId })
                  .filter(l => l.remainingQuantity >= 0)
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
              }

              // Movimiento de reversión de ingrediente
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
            // Producto normal: revertir stock del producto
            const previousStock = product.stock;
            const baseQty = product.isWeighted
              ? convertToStorage(item.quantity, product.unit === 'lt' ? 'pesable_lt' : 'pesable_kg')
              : Math.round(item.quantity);
            const storageQty = baseQty * (item.unitMultiplier || 1);
            const newStock = previousStock + storageQty;
            await db.products.update(item.productId, { stock: newStock });

            // AUDIT-012: FIFO restore (track original lot consumption)
            // Si tenemos consumedLots, restaurar a los lotes ORIGINALES. Sino, fallback legacy.
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
              // Fallback legacy: ventas pre-AUDIT-012 sin tracking — restaurar lotes más recientes primero
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

        // Revertir totales de caja si existe una caja abierta
        if (cashReg) {
          // AUDIT-FLOW-12-012: Si la caja ya está cerrada, NO actualizar totales
          // (eso corrompería expectedClosingBs/differenceBs del arqueo). Abortar.
          if (!cashReg.isOpen) {
            throw new AppError(
              PosErrors.SALE_VOID_BOX_CLOSED,
              'No se puede anular una venta cuya caja ya está cerrada. Crea un ajuste manual.',
            );
          }
          // AUDIT-011: Canonical totals recompute (no silent clamp)
          // Re-leer todas las ventas completed (no voided) en la ventana de la caja
          // y derivar totales desde la fuente de verdad, no por decremento.
          const regOpened = cashReg.openedAt ?? cashReg.createdAt; // AUDIT-011
          const regClosed = cashReg.closedAt ?? now; // AUDIT-011
          const completedRegSales = await db.sales // AUDIT-011
            .where({ tenantId })
            .filter((s) =>
              !s.deletedAt &&
              s.status === 'completed' &&
              !s.voidedAt &&
              !s.isCreditSale && // Credit sales were never added to the register
              s.createdAt >= regOpened &&
              s.createdAt <= regClosed,
            )
            .toArray();

          let canonicalTotalSalesBs = 0; // AUDIT-011
          let canonicalTotalIgtfBs = 0; // AUDIT-011
          for (const s of completedRegSales) {
            canonicalTotalSalesBs += s.totalBs;
            canonicalTotalIgtfBs += s.igtfBs;
          }
          canonicalTotalSalesBs = preciseRound(canonicalTotalSalesBs, 2);
          canonicalTotalIgtfBs = preciseRound(canonicalTotalIgtfBs, 2);
          const canonicalCount = completedRegSales.length;

          // AUDIT-011: Si el cómputo da negativo (no debería), loggear como bug y usar 0
          if (canonicalTotalSalesBs < 0) {
            logger.error('voidSale', `BUG: canonical totalSalesBs=${canonicalTotalSalesBs} en register ${cashReg.id} tras anular ${saleId}. Usando 0.`);
            canonicalTotalSalesBs = 0;
          }
          if (canonicalTotalIgtfBs < 0) {
            logger.error('voidSale', `BUG: canonical totalIgtfBs=${canonicalTotalIgtfBs} en register ${cashReg.id} tras anular ${saleId}. Usando 0.`);
            canonicalTotalIgtfBs = 0;
          }

          await db.cashRegisters.update(cashReg.id, {
            totalSalesCount: canonicalCount, // AUDIT-011
            totalSalesBs: canonicalTotalSalesBs, // AUDIT-011
            totalIgtfBs: canonicalTotalIgtfBs, // AUDIT-011
            updatedAt: now,
          });

          await syncQueue.enqueue('cash_registers', 'UPDATE', cashReg.id, toSnake({
            id: cashReg.id,
            tenant_id: tenantUuid,
            total_sales_count: canonicalCount, // AUDIT-011
            total_sales_bs: canonicalTotalSalesBs, // AUDIT-011
            total_igtf_bs: canonicalTotalIgtfBs, // AUDIT-011
            updated_at: now,
          } as unknown as Record<string, unknown>), tenantId);
        }

        await outboxService.enqueue('SALE.VOIDED', MODULE_NAME, { saleId, tenantSlug: tenantId }, tx);

        await syncQueue.enqueue('sales', 'UPDATE', saleId, toSnake({
          id: saleId, tenant_id: tenantUuid, status: 'voided', voided_at: now,
        } as unknown as Record<string, unknown>), tenantId);

        // Reduce customer balance for uncollected credit sales
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
  },

  async closeCashRegister(input: CloseCashRegisterInput): Promise<Result<CashRegister, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    const { tenantId, userId, declaredClosingBalanceBs, closingRate } = input;

    requireRole('owner', 'admin');

    const cashReg = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();

    if (!cashReg) {
      return failure(new AppError(PosErrors.BOX_ALREADY_CLOSED, 'La caja ya está cerrada.'));
    }

    const now = new Date().toISOString();
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

    const expectedClosingBs = preciseRound(
      (cashReg.openingBalanceBs ?? 0) + cashReg.totalSalesBs,
      2,
    );

    // AUDIT-FLOW-10-010A: Diferencia ≤ 1 céntimo se ajusta a 0 (Regla #6 + #8).
    const rawDiff = preciseRound(declaredClosingBalanceBs - expectedClosingBs, 2);
    const differenceBs = Math.abs(rawDiff) <= MAX_CENTS_DIFFERENCE ? 0 : rawDiff;

    try {
      await db.transaction('rw', [db.cashRegisters, db.syncQueue, db.outbox], async (tx) => {
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

        await outboxService.enqueue(SystemEvents.BOX_CLOSED, MODULE_NAME, {
          registerId: cashReg.id,
          tenantSlug: tenantId,
          expectedBs: expectedClosingBs,
          declaredBs: declaredClosingBalanceBs,
          differenceBs,
        }, tx);
      });

      await logAuditEventOnly({
        eventName: SystemEvents.BOX_CLOSED,
        module: MODULE_NAME,
        payload: { registerId: cashReg.id, tenantSlug: tenantId, expectedBs: expectedClosingBs, declaredBs: declaredClosingBalanceBs, differenceBs },
        context: { userId, tenantId, tenantUuid },
      });


      // Push inmediato para sincronizar cierre de caja a la nube
      syncEngine.pushNow().catch((err) => logger.warn(MODULE_NAME, 'pushNow failed (closeCash):', err));

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
      const result: import('../types').ParkedCart[] = [];
      for (const r of rows) {
        try {
          result.push({
            id: r.id,
            tenantId: r.tenantId,
            name: r.name,
            cart: JSON.parse(r.cartJson) as import('../types').CartItem[],
            createdAt: r.createdAt,
          });
        } catch (err) {
          // POS-002 (M-9): JSON corrupto se loguea y se ignora, no se propaga el error.
          logger.warn(MODULE_NAME, `parkedCart ${r.id} tiene cartJson corrupto, se omite:`, err);
        }
      }
      return success(result);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getParkedCarts:', err);
      return failure(new AppError('PARKED_CARTS_FETCH_FAILED', 'Error al cargar ventas en cola.'));
    }
  },

  async parkCart(tenantId: string, name: string, cart: import('../types').CartItem[], customerId?: string): Promise<Result<string, AppError>> {
    try {
      const db = getDb();
      const existingCount = await db.parkedCarts.where({ tenantId }).count();
      if (existingCount >= MAX_PARKED_CARTS) {
        return failure(new AppError('CART_ITEM_WEIGHT_REQUIRED', `Máximo ${MAX_PARKED_CARTS} ventas en cola. Completa o elimina una.`));
      }
      const id = generateId();
      await db.parkedCarts.add({
        id, tenantId,
        name: name.trim() || `Venta #${existingCount + 1}`,
        cartJson: JSON.stringify(cart),
        customerId,
        createdAt: new Date().toISOString(),
      });
      return success(id);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en parkCart:', err);
      return failure(new AppError('PARKED_CART_SAVE_FAILED', 'Error al guardar venta en cola.'));
    }
  },

  async deleteParkedCart(tenantId: string, id: string): Promise<Result<void, AppError>> {
    try {
      const db = getDb();
      // AUDIT-010: Tenant guard on delete (Regla 5) — verificar tenantId antes de borrar
      const existing = await db.parkedCarts.get(id);
      if (!existing || existing.tenantId !== tenantId) {
        return failure(new AppError('PARKED_CART_NOT_FOUND', 'Venta en cola no encontrada.'));
      }
      // Efímero: carritos en cola no se sincronizan ni necesitan soft delete
      await db.parkedCarts.delete(id);
      return success(undefined);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en deleteParkedCart:', err);
      return failure(new AppError('PARKED_CART_DELETE_FAILED', 'Error al eliminar venta en cola.'));
    }
  },

  // ===== FAVORITES =====

  async toggleFavorite(tenantId: string, productId: string): Promise<Result<boolean, AppError>> {
    try {
      const db = getDb();
      const existing = await db.productFavorites.get([productId, tenantId]);
      if (existing) {
        await db.productFavorites.delete([productId, tenantId]);
        return success(false);
      }
      await db.productFavorites.add({ productId, tenantId, createdAt: new Date().toISOString() });
      return success(true);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en toggleFavorite:', err);
      return failure(new AppError('FAVORITE_TOGGLE_FAILED', 'Error al cambiar favorito.'));
    }
  },

  async getFavorites(tenantId: string): Promise<Result<Set<string>, AppError>> {
    try {
      const db = getDb();
      const favs = await db.productFavorites.where({ tenantId }).toArray();
      return success(new Set(favs.map((f) => f.productId)));
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getFavorites:', err);
      return failure(new AppError('FAVORITES_FETCH_FAILED', 'Error al cargar favoritos.'));
    }
  },

  async getTodaySoldProducts(
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
  },

  async getVerificationProducts(tenantId: string, referenceDate?: Date): Promise<Result<VerificationProduct[], AppError>> {
    try {
      const db = getDb();
      const [soldResult, lowStockResult, zeroStockRows, assemblyRecipes] = await Promise.all([
        this.getTodaySoldProducts(tenantId, 10, referenceDate),
        (await import('../../inventory/services/inventoryService')).inventoryService.getLowStockProducts(tenantId),
        db.products.where({ tenantId }).filter((p) => !p.deletedAt && p.stock === 0 && p.isSellable !== false).toArray(),
        db.recipes.where({ tenantId }).filter((r) => !r.deletedAt && r.isActive && r.mode === 'assembly').toArray(),
      ]);

      const assemblyIds = new Set(assemblyRecipes.map((r) => r.productId));
      const filteredZeroStock = zeroStockRows.filter((p) => !assemblyIds.has(p.id));

      const productIds = new Set<string>();
      if (soldResult.ok) for (const p of soldResult.data) productIds.add(p.productId);
      if (lowStockResult.ok) for (const p of lowStockResult.data) productIds.add(p.id);
      for (const p of filteredZeroStock) productIds.add(p.id);

      if (productIds.size === 0) return success([]);

      const soldMap = new Map<string, number>();
      if (soldResult.ok) for (const p of soldResult.data) soldMap.set(p.productId, p.quantity);

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
  },
};
