import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { getDb, type DexieSale } from '../../../services/dexie/db';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { ReportsErrors } from '../../../specs/reports/errors';
import { ReportsFiltersSchema, ValidateTenantInputSchema, TopProductsLimitSchema } from '../../../specs/reports/index';
import type { PaymentMethod } from '../../../specs/pos';
import { logger } from '../../../lib/logger';
import { startOfDayVzla, endOfDayVzla } from '../../../lib/date';
import { requireRole } from '../../auth/services/roleGuard';
import type {
  ReportFilters,
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  TopCategoryData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
  AdjustmentLossExpenses,
  SaleDetail,
  DiscountBreakdownItem,
  ExpenseBreakdownItem,
  TicketDistributionItem,
} from '../types';

const PAYMENT_LABELS: Record<string, string> = {
  efectivo_bs: 'Efectivo Bs',
  pago_movil: 'Pago Móvil',
  tarjeta_bs: 'Tarjeta Bs',
  efectivo_usd: 'Efectivo USD',
};

function getDateRange(filters: ReportFilters): { start: string; end: string } {
  switch (filters.timeRange) {
    case 'today':
      return { start: startOfDayVzla(), end: endOfDayVzla() };
    case 'yesterday': {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const d = new Date(y.getFullYear(), y.getMonth(), y.getDate());
      return { start: startOfDayVzla(d), end: endOfDayVzla(d) };
    }
    case 'last7days': {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { start: startOfDayVzla(d), end: endOfDayVzla() };
    }
    case 'thisMonth': {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDayVzla(firstDay), end: endOfDayVzla() };
    }
    case 'lastMonth': {
      const now = new Date();
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDayVzla(lm), end: endOfDayVzla(lmEnd) };
    }
    case 'custom':
      return {
        start: filters.startDate ? startOfDayVzla(new Date(filters.startDate)) : startOfDayVzla(),
        end: filters.endDate ? endOfDayVzla(new Date(filters.endDate)) : endOfDayVzla(),
      };
    default:
      return { start: startOfDayVzla(), end: endOfDayVzla() };
  }
}

interface SaleWithItems {
  sale: {
    id: string;
    totalBs: number;
    igtfBs: number;
    ivaBs?: number;
    exchangeRate: number;
    paymentMethod: string;
    createdAt: string;
    discountBs?: number;
  };
  items: {
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitMultiplier?: number;
    unitPriceUsd: number;
    costUsdPerUnit?: number;
  }[];
}

// --- Sales fetch cache (dedup identical concurrent calls from useReports Promise.all) ---
const salesCache = new Map<string, { data: SaleWithItems[]; ts: number }>();
const SALES_CACHE_TTL_MS = 500;

function salesCacheKey(tenantId: string, start: string, end: string): string {
  return `${tenantId}:${start}:${end}`;
}

async function fetchSalesWithItems(tenantId: string, start: string, end: string): Promise<SaleWithItems[]> {
  const key = salesCacheKey(tenantId, start, end);
  const cached = salesCache.get(key);
  if (cached && Date.now() - cached.ts < SALES_CACHE_TTL_MS) return cached.data;

  const db = getDb();
  const sales = await db.sales
    .where('[tenantId+createdAt]')
    .between([tenantId, start], [tenantId, end])
    .filter((s) => !s.deletedAt && s.status === 'completed')
    .toArray();

  if (sales.length > 0) {
    const saleIds = sales.map((s) => s.id);
    const allItems = await db.saleItems
      .where('saleId')
      .anyOf(saleIds)
      .filter((i) => !i.deletedAt)
      .toArray();

    if (allItems.length > 0) {
      const itemsBySaleId = new Map<string, typeof allItems>();
      for (const item of allItems) {
        const group = itemsBySaleId.get(item.saleId);
        if (group) group.push(item);
        else itemsBySaleId.set(item.saleId, [item]);
      }

      const result = sales.map((sale) => ({
        sale: {
          id: sale.id,
          totalBs: sale.totalBs,
          igtfBs: sale.igtfBs,
          ivaBs: sale.ivaBs,
          exchangeRate: sale.exchangeRate,
          paymentMethod: sale.paymentMethod,
          createdAt: sale.createdAt,
          discountBs: sale.discountBs,
        },
        items: (itemsBySaleId.get(sale.id) ?? []).map((i) => ({
          productId: i.productId,
          productName: i.productName,
          productSku: i.productSku,
          quantity: i.quantity,
          unitMultiplier: i.unitMultiplier,
          unitPriceUsd: i.unitPriceUsd,
          costUsdPerUnit: i.costUsdPerUnit,
        })),
      }));
      salesCache.set(key, { data: result, ts: Date.now() });
      return result;
    }

    // Race condition: Dexie has sales but items haven't synced yet.
    // Merge: use Dexie sales (local authority) + fetch items from Supabase.
    try {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      const { data: cloudItems, error: itemsError } = await supabase
        .from('sale_items')
        .select('sale_id, product_id, product_name, product_sku, quantity, unit_price_usd, cost_usd_per_unit, unit_multiplier')
        .eq('tenant_id', tenantUuid)
        .in('sale_id', saleIds)
        .is('deleted_at', null);

      if (!itemsError && cloudItems && cloudItems.length > 0) {
        const itemsBySaleId = new Map<string, typeof cloudItems>();
        for (const item of cloudItems) {
          const sId = item.sale_id;
          if (!itemsBySaleId.has(sId)) itemsBySaleId.set(sId, []);
          itemsBySaleId.get(sId)!.push(item);
        }

        const result = sales.map((sale) => ({
          sale: {
            id: sale.id,
            totalBs: sale.totalBs,
            igtfBs: sale.igtfBs,
            ivaBs: sale.ivaBs,
            exchangeRate: sale.exchangeRate,
            paymentMethod: sale.paymentMethod,
            createdAt: sale.createdAt,
            discountBs: sale.discountBs,
          },
          items: (itemsBySaleId.get(sale.id) ?? []).map((i) => ({
            productId: i.product_id,
            productName: i.product_name || '',
            productSku: i.product_sku || '',
            quantity: Number(i.quantity),
            unitMultiplier: i.unit_multiplier ? Number(i.unit_multiplier) : 1,
            unitPriceUsd: Number(i.unit_price_usd) || 0,
            costUsdPerUnit: i.cost_usd_per_unit ? Number(i.cost_usd_per_unit) : undefined,
          })),
        }));
        salesCache.set(key, { data: result, ts: Date.now() });
        return result;
      }
    } catch {
      // Supabase fetch failed — fall through to full Supabase fallback
    }
  }

  // Fallback a Supabase si Dexie está vacío o hay race condition de sync
  try {
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const { data: cloudSales, error: salesError } = await supabase
      .from('sales')
      .select('id, total_bs, igtf_bs, iva_bs, exchange_rate, payment_method, created_at, discount_bs')
      .eq('tenant_id', tenantUuid)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .gte('created_at', start)
      .lt('created_at', end);

    if (salesError || !cloudSales || cloudSales.length === 0) return [];

    const saleIds = cloudSales.map((s) => s.id);
    const { data: cloudItems, error: itemsError } = await supabase
      .from('sale_items')
      .select('sale_id, product_id, product_name, product_sku, quantity, unit_price_usd, cost_usd_per_unit, unit_multiplier')
      .eq('tenant_id', tenantUuid)
      .in('sale_id', saleIds)
      .is('deleted_at', null);

    if (itemsError || !cloudItems) return [];

    const itemsBySaleId = new Map<string, typeof cloudItems>();
    for (const item of cloudItems) {
      const sId = item.sale_id;
      if (!itemsBySaleId.has(sId)) itemsBySaleId.set(sId, []);
      itemsBySaleId.get(sId)!.push(item);
    }

    const cloudResult = cloudSales.map((sale) => ({
      sale: {
        id: sale.id,
        totalBs: Number(sale.total_bs) || 0,
        igtfBs: Number(sale.igtf_bs) || 0,
        ivaBs: sale.iva_bs ? Number(sale.iva_bs) : undefined,
        exchangeRate: Number(sale.exchange_rate) || 1,
        paymentMethod: sale.payment_method || 'efectivo_bs',
        createdAt: sale.created_at,
        discountBs: sale.discount_bs ? Number(sale.discount_bs) : undefined,
      },
      items: (itemsBySaleId.get(sale.id) ?? []).map((i) => ({
        productId: i.product_id,
        productName: i.product_name || '',
        productSku: i.product_sku || '',
        quantity: Number(i.quantity),
        unitMultiplier: i.unit_multiplier ? Number(i.unit_multiplier) : 1, // POS-001-01: read actual multiplier (was hardcoded 1, broke "Pack 6" WAC/COGS)
        unitPriceUsd: Number(i.unit_price_usd) || 0,
        costUsdPerUnit: i.cost_usd_per_unit ? Number(i.cost_usd_per_unit) : undefined,
      })),
    }));
    salesCache.set(key, { data: cloudResult, ts: Date.now() });
    return cloudResult;
  } catch {
    return [];
  }
}

function effectiveItemQuantity(item: { quantity: number; unitMultiplier?: number }): number {
  return item.quantity * (item.unitMultiplier ?? 1);
}

function calcItemCostBs(quantity: number, costUsdPerUnit: number | undefined, exchangeRate: number, unitMultiplier: number = 1): number {
  if (!costUsdPerUnit || costUsdPerUnit <= 0) return 0;
  const effectiveQuantity = quantity * unitMultiplier;
  return preciseRound(effectiveQuantity * costUsdPerUnit * exchangeRate, 2);
}

/** Busca la tasa de cambio activa más cercana a una fecha dada */
async function getRateForDate(tenantId: string, date: string): Promise<number> {
  const db = getDb();
  const rates = await db.exchangeRates
    .where('tenantId')
    .equals(tenantId)
    .filter((r) => r.createdAt <= date)
    .toArray();

  if (rates.length > 0) {
    rates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rates[0].rate;
  }

  // Fallback: la tasa más reciente disponible en Dexie
  const allRates = await db.exchangeRates
    .where('tenantId')
    .equals(tenantId)
    .toArray();

  if (allRates.length > 0) {
    allRates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return allRates[0].rate;
  }

  // Fallback a Supabase
  try {
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const { data } = await supabase
      .from('exchange_rates')
      .select('rate, created_at')
      .eq('tenant_id', tenantUuid)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const cloudRate = Number(data.rate) || 0;
      if (cloudRate > 0) {
        await db.exchangeRates.put({
          id: crypto.randomUUID(),
          tenantId,
          rate: cloudRate,
          source: 'bcv_api',
          fetchedAt: null,
          createdAt: data.created_at,
        });
        return cloudRate;
      }
    }
  } catch {
    // Silencioso: no hay conexión o no existe el tenant en la nube
  }

  return 0;
}

// Module-level cache for exchange rates to avoid N+1 queries
const rateCache = new Map<string, number>();

async function getRateForDateCached(tenantId: string, date: string): Promise<number> {
  if (rateCache.size > 500) rateCache.clear();
  const key = `${tenantId}:${date}`;
  if (rateCache.has(key)) return rateCache.get(key)!;
  const rate = await getRateForDate(tenantId, date);
  rateCache.set(key, rate);
  return rate;
}

export const reportsService = {
  async getExecutiveSummary(tenantId: string, filters: ReportFilters): Promise<Result<ExecutiveSummaryData, AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const filtersCheck = ReportsFiltersSchema.safeParse(filters);
    if (!filtersCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
    }
    try {
      requireRole('owner', 'admin');
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      let totalSalesBs = 0;
      let totalSalesUsd = 0;
      let totalRevenueBs = 0;
      let totalRevenueUsd = 0;
      let totalCostBs = 0;
      let totalCostUsd = 0;
      let totalDiscountBs = 0;
      let totalIvaBs = 0;
      let totalIvaUsd = 0;
      const productProfitMap = new Map<string, { name: string; profit: number }>();

      let totalDiscountUsdAccum = 0;
      for (const { sale, items } of data) {
        totalSalesBs += sale.totalBs;
        totalIvaBs += sale.ivaBs || 0;
        if (sale.ivaBs && sale.exchangeRate > 0) {
          totalIvaUsd += preciseRound(sale.ivaBs / sale.exchangeRate, 2);
        }
        totalDiscountBs += sale.discountBs || 0;
        const saleUsd = sale.exchangeRate > 0 ? sale.totalBs / sale.exchangeRate : 0;
        totalSalesUsd += saleUsd;
        if (sale.discountBs && sale.exchangeRate > 0) {
          totalDiscountUsdAccum += preciseRound(sale.discountBs / sale.exchangeRate, 2);
        }
        for (const item of items) {
          const costBs = calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate, item.unitMultiplier);
          const costUsd = item.costUsdPerUnit ? preciseRound(effectiveItemQuantity(item) * item.costUsdPerUnit, 2) : 0;
          const revenueBs = preciseRound(item.quantity * item.unitPriceUsd * sale.exchangeRate, 2);
          const revenueUsd = preciseRound(item.quantity * item.unitPriceUsd, 2);
          totalRevenueBs += revenueBs;
          totalRevenueUsd += revenueUsd;
          totalCostBs += costBs;
          totalCostUsd += costUsd;

          const profit = revenueBs - costBs;
          const existing = productProfitMap.get(item.productId);
          if (existing) {
            existing.profit += profit;
          } else {
            productProfitMap.set(item.productId, { name: item.productName, profit });
          }
        }
      }

      totalSalesBs = preciseRound(totalSalesBs, 2);
      totalSalesUsd = preciseRound(totalSalesUsd, 2);
      totalRevenueBs = preciseRound(totalRevenueBs, 2);
      totalRevenueUsd = preciseRound(totalRevenueUsd, 2);
      totalCostBs = preciseRound(totalCostBs, 2);
      totalCostUsd = preciseRound(totalCostUsd, 2);
      totalIvaBs = preciseRound(totalIvaBs, 2);
      const effectiveRevenueBs = preciseRound(totalRevenueBs - (totalDiscountBs || 0), 2);
      const effectiveRevenueUsd = preciseRound(totalRevenueUsd - (totalDiscountUsdAccum || 0), 2);
      const grossProfitBs = preciseRound(effectiveRevenueBs - totalCostBs, 2);
      const grossProfitUsd = preciseRound(effectiveRevenueUsd - totalCostUsd, 2);
      const profitMarginPercent = effectiveRevenueBs > 0 ? preciseRound((grossProfitBs / effectiveRevenueBs) * 100, 2) : 0;
      const totalTransactions = data.length;
      const averageTicketBs = totalTransactions > 0 ? preciseRound(effectiveRevenueBs / totalTransactions, 2) : 0;
      const averageTicketUsd = totalTransactions > 0 ? preciseRound(effectiveRevenueUsd / totalTransactions, 2) : 0;
      const totalDiscountUsd = totalDiscountUsdAccum > 0 ? preciseRound(totalDiscountUsdAccum, 2) : 0;

      let topProductName: string | undefined;
      let maxProfit = -Infinity;
      for (const [, val] of productProfitMap) {
        if (val.profit > maxProfit) {
          maxProfit = val.profit;
          topProductName = val.name;
        }
      }

      // Non-sellable expenses (compras del período)
      const nsResult = await this.getNonSellableExpenses(tenantId, start, end);
      const nonSellableExpensesUsd = nsResult.ok ? nsResult.data.totalUsd : 0;
      const nonSellableExpensesBs = nsResult.ok ? nsResult.data.totalBs : 0;

      // Adjustment loss expenses
      const adjResult = await this.getAdjustmentLossExpenses(tenantId, start, end);
      const adjustmentLossExpenses = adjResult.ok ? adjResult.data : {
        perdida: { totalUsd: 0, count: 0, estimatedCount: 0 },
        robo: { totalUsd: 0, count: 0, estimatedCount: 0 },
        vencido: { totalUsd: 0, count: 0, estimatedCount: 0 },
        consumo_interno: { totalUsd: 0, count: 0, estimatedCount: 0 },
        otros: { totalUsd: 0, count: 0, estimatedCount: 0 },
        totalUsd: 0,
        totalBs: 0,
        estimatedTotalUsd: 0,
      };
      // Operating expenses (gastos operativos del período)
      // BACKLOG-106 [REPORTS-001]: Excluir COMPRA_INVENTARIO (el costo ya está en COGS vía purchaseOrder).
      // Si se incluye acá, grossProfit se reduce doble (una vez en COGS, otra como gasto operativo).
      const db = getDb();
      const startNorm = start.slice(0, 10);
      const endNorm = end.slice(0, 10);
      const operatingExpenses = await db.expenses
        .where('[tenantId+date]')
        .between([tenantId, startNorm], [tenantId, endNorm])
        .filter((e) => !e.deletedAt && !e.isRecurring && e.status === 'paid' && e.category !== 'COMPRA_INVENTARIO')
        .toArray();
      const operatingExpensesUsd = operatingExpenses.reduce((s, e) => s + e.amountUsd, 0);
      const operatingExpensesBs = operatingExpenses.reduce((s, e) => s + e.amountBs, 0);

      const totalExpensesUsd = preciseRound(nonSellableExpensesUsd + adjustmentLossExpenses.totalUsd + operatingExpensesUsd, 2);
      const totalExpensesBs = preciseRound(nonSellableExpensesBs + adjustmentLossExpenses.totalBs + operatingExpensesBs, 2);
      const netProfitUsd = preciseRound(grossProfitUsd - totalExpensesUsd, 2);
      const netProfitBs = preciseRound(grossProfitBs - totalExpensesBs, 2);

      // Comparacion vs ayer
      let salesVsYesterdayPercent: number | undefined;
      if (filters.timeRange === 'today') {
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        const yStart = startOfDayVzla(yest);
        const yEnd = endOfDayVzla(yest);
        const yData = await fetchSalesWithItems(tenantId, yStart, yEnd);
        // AUDIT-015: Discounts in YRevenue (apples-to-apples con effectiveRevenueBs de hoy)
        // Mismo orden de operaciones: items con preciseRound, suma de descuentos, resta final.
        let yRevenueBeforeDiscount = 0; // AUDIT-015
        let yDiscountBs = 0; // AUDIT-015
        for (const d of yData) {
          for (const i of d.items) {
            yRevenueBeforeDiscount += preciseRound(i.quantity * i.unitPriceUsd * d.sale.exchangeRate, 2); // AUDIT-015
          }
          yDiscountBs += d.sale.discountBs || 0; // AUDIT-015
        }
        const yRevenue = preciseRound(yRevenueBeforeDiscount - yDiscountBs, 2); // AUDIT-015
        if (yRevenue > 0) {
          salesVsYesterdayPercent = preciseRound(((effectiveRevenueBs - yRevenue) / yRevenue) * 100, 2);
        }
      }

      return success({
        totalSalesBs,
        totalSalesUsd,
        totalCostBs,
        totalCostUsd,
        grossProfitBs,
        grossProfitUsd,
        profitMarginPercent,
        totalTransactions,
        averageTicketBs,
        averageTicketUsd,
        topProductName,
        salesVsYesterdayPercent,
        nonSellableExpensesUsd,
        nonSellableExpensesBs,
        adjustmentLossExpenses,
        operatingExpensesUsd,
        operatingExpensesBs,
        totalExpensesUsd,
        totalExpensesBs,
        netProfitUsd,
        netProfitBs,
        totalDiscountBs,
        totalDiscountUsd,
        totalIvaBs,
        totalIvaUsd,
      });
    } catch (err) {
      console.error('[reportsService.getExecutiveSummary]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar el resumen ejecutivo.'));
    }
  },

  async getProfitOverTime(tenantId: string, filters: ReportFilters): Promise<Result<DailyProfitPoint[], AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const filtersCheck = ReportsFiltersSchema.safeParse(filters);
    if (!filtersCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
    }
    try {
      requireRole('owner', 'admin');
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      const map = new Map<string, DailyProfitPoint>();
      const discountByDate = new Map<string, number>();

      for (const { sale, items } of data) {
        const dateKey = sale.createdAt.slice(0, 10);
        const label = new Date(dateKey).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
        if (!map.has(dateKey)) {
          map.set(dateKey, { date: dateKey, label, salesBs: 0, salesUsd: 0, costBs: 0, costUsd: 0, profitBs: 0, profitUsd: 0, transactions: 0, lastRate: sale.exchangeRate });
        }
        const point = map.get(dateKey)!;
        point.transactions += 1;
        point.lastRate = sale.exchangeRate;

        const currentDiscount = discountByDate.get(dateKey) || 0;
        discountByDate.set(dateKey, currentDiscount + (sale.discountBs || 0));

        for (const item of items) {
          const revenueBs = preciseRound(item.quantity * item.unitPriceUsd * sale.exchangeRate, 2);
          const revenueUsd = preciseRound(item.quantity * item.unitPriceUsd, 2);
          point.salesBs += revenueBs;
          point.salesUsd += revenueUsd;
          point.costBs += calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate, item.unitMultiplier);
          point.costUsd += item.costUsdPerUnit ? preciseRound(effectiveItemQuantity(item) * item.costUsdPerUnit, 2) : 0;
        }
      }

      const sorted = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
      for (const point of sorted) {
        const discount = discountByDate.get(point.date) || 0;
        const effectiveRevenueBs = preciseRound(point.salesBs - discount, 2);
        // DINERO-006 (A1): acumular USD directamente, no convertir desde Bs (cada venta tiene su propia tasa).
        const effectiveRevenueUsd = point.lastRate > 0
          ? preciseRound(point.salesUsd - (discount / point.lastRate), 2)
          : 0;
        point.salesBs = preciseRound(point.salesBs, 2);
        point.salesUsd = preciseRound(point.salesUsd, 2);
        point.costBs = preciseRound(point.costBs, 2);
        point.costUsd = preciseRound(point.costUsd, 2);
        point.profitBs = preciseRound(effectiveRevenueBs - point.costBs, 2);
        point.profitUsd = preciseRound(effectiveRevenueUsd - point.costUsd, 2);
        point.lastRate = preciseRound(point.lastRate, 4);
      }

      return success(sorted);
    } catch (err) {
      console.error('[reportsService.getProfitOverTime]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar grafico de ganancias.'));
    }
  },

  async getTopProducts(tenantId: string, filters: ReportFilters, limit = 10): Promise<Result<TopProductData[], AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const filtersCheck = ReportsFiltersSchema.safeParse(filters);
    if (!filtersCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
    }
    const limitCheck = TopProductsLimitSchema.safeParse(limit);
    if (!limitCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_LIMIT_INVALID, limitCheck.error.issues[0]?.message || 'Límite inválido.'));
    }
    try {
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      const map = new Map<string, TopProductData>();
      for (const { sale, items } of data) {
        for (const item of items) {
          const effectiveId = item.productId;
          const effectiveName = item.productName;
          const existing = map.get(effectiveId);
          const revenueBs = preciseRound(item.quantity * item.unitPriceUsd * sale.exchangeRate, 2);
          const revenueUsd = preciseRound(item.quantity * item.unitPriceUsd, 2);
          const costBs = calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate, item.unitMultiplier);
          const costUsd = item.costUsdPerUnit ? preciseRound(effectiveItemQuantity(item) * item.costUsdPerUnit, 2) : 0;
          const profitBs = preciseRound(revenueBs - costBs, 2);
          const profitUsd = preciseRound(revenueUsd - costUsd, 2);

          if (existing) {
            existing.quantitySold += item.quantity;
            existing.revenueBs = preciseRound(existing.revenueBs + revenueBs, 2);
            existing.revenueUsd = preciseRound(existing.revenueUsd + revenueUsd, 2);
            existing.costBs = preciseRound(existing.costBs + costBs, 2);
            existing.costUsd = preciseRound(existing.costUsd + costUsd, 2);
            existing.profitBs = preciseRound(existing.profitBs + profitBs, 2);
            existing.profitUsd = preciseRound(existing.profitUsd + profitUsd, 2);
          } else {
            map.set(effectiveId, {
              productId: effectiveId,
              name: effectiveName,
              sku: item.productSku,
              quantitySold: item.quantity,
              revenueBs,
              revenueUsd,
              costBs,
              costUsd,
              profitBs,
              profitUsd,
              marginPercent: revenueBs > 0 ? preciseRound((profitBs / revenueBs) * 100, 2) : 0,
            });
          }
        }
      }

      const sorted = Array.from(map.values())
        .sort((a, b) => b.profitBs - a.profitBs)
        .slice(0, limit);

      for (const item of sorted) {
        item.marginPercent = item.revenueBs > 0 ? preciseRound((item.profitBs / item.revenueBs) * 100, 2) : 0;
      }

      return success(sorted);
    } catch (err) {
      console.error('[reportsService.getTopProducts]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar top productos.'));
    }
  },

  async getTopCategories(tenantId: string, filters: ReportFilters): Promise<Result<TopCategoryData[], AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const filtersCheck = ReportsFiltersSchema.safeParse(filters);
    if (!filtersCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
    }
    try {
      const { start, end } = getDateRange(filters);
      const salesData = await fetchSalesWithItems(tenantId, start, end);

      if (salesData.length === 0) return success([]);

      const db = getDb();

      const products = await db.products
        .where({ tenantId })
        .filter((p) => !p.deletedAt)
        .toArray();
      const productCategoryMap = new Map<string, string | undefined>();
      for (const p of products) {
        productCategoryMap.set(p.id, p.categoryId);
      }

      const categories = await db.categories
        .where({ tenantId })
        .filter((c) => !c.deletedAt)
        .toArray();
      const categoryNameMap = new Map<string, string>();
      for (const c of categories) {
        categoryNameMap.set(c.id, c.name);
      }

      const catAgg = new Map<string, {
        productIds: Set<string>;
        quantitySold: number;
        revenueUsd: number;
        revenueBs: number;
        costUsd: number;
        costBs: number;
      }>();

      const UNCATEGORIZED_KEY = '__uncategorized__';

      for (const { sale, items } of salesData) {
        for (const item of items) {
          const catId = productCategoryMap.get(item.productId) ?? UNCATEGORIZED_KEY;
          let agg = catAgg.get(catId);
          if (!agg) {
            agg = { productIds: new Set(), quantitySold: 0, revenueUsd: 0, revenueBs: 0, costUsd: 0, costBs: 0 };
            catAgg.set(catId, agg);
          }
          const revUsd = preciseRound(item.quantity * item.unitPriceUsd, 2);
          const revBs = preciseRound(item.quantity * item.unitPriceUsd * sale.exchangeRate, 2);
          const cUsd = item.costUsdPerUnit ? preciseRound(effectiveItemQuantity(item) * item.costUsdPerUnit, 2) : 0;
          const cBs = calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate, item.unitMultiplier);
          agg.productIds.add(item.productId);
          agg.quantitySold += item.quantity;
          agg.revenueUsd = preciseRound(agg.revenueUsd + revUsd, 2);
          agg.revenueBs = preciseRound(agg.revenueBs + revBs, 2);
          agg.costUsd = preciseRound(agg.costUsd + cUsd, 2);
          agg.costBs = preciseRound(agg.costBs + cBs, 2);
        }
      }

      const result: TopCategoryData[] = [];
      for (const [catId, agg] of catAgg) {
        const name = catId === UNCATEGORIZED_KEY ? 'Sin categoría' : (categoryNameMap.get(catId) ?? 'Categoría desconocida');
        const profitBs = preciseRound(agg.revenueBs - agg.costBs, 2);
        const profitUsd = preciseRound(agg.revenueUsd - agg.costUsd, 2);
        result.push({
          categoryId: catId === UNCATEGORIZED_KEY ? '' : catId,
          categoryName: name,
          productCount: agg.productIds.size,
          quantitySold: agg.quantitySold,
          revenueBs: agg.revenueBs,
          revenueUsd: agg.revenueUsd,
          costBs: agg.costBs,
          costUsd: agg.costUsd,
          profitBs,
          profitUsd,
          marginPercent: agg.revenueBs > 0 ? preciseRound((profitBs / agg.revenueBs) * 100, 2) : 0,
        });
      }

      result.sort((a, b) => {
        if (b.profitBs !== a.profitBs) return b.profitBs - a.profitBs;
        return a.categoryName.localeCompare(b.categoryName);
      });

      return success(result);
    } catch (err) {
      console.error('[reportsService.getTopCategories]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar análisis por categorías.'));
    }
  },

  async getPaymentBreakdown(tenantId: string, filters: ReportFilters): Promise<Result<PaymentBreakdownData[], AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const filtersCheck = ReportsFiltersSchema.safeParse(filters);
    if (!filtersCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
    }
    try {
      const { start, end } = getDateRange(filters);
      const db = getDb();
      const sales = await db.sales
        .where('[tenantId+createdAt]')
        .between([tenantId, start], [tenantId, end])
        .filter((s) => !s.deletedAt && s.status === 'completed')
        .toArray();

      let salesData = sales;

      // Fallback a Supabase si Dexie está vacío
      if (salesData.length === 0) {
        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        const { data: cloudSales, error } = await supabase
          .from('sales')
          .select('total_bs, payment_method, exchange_rate')
          .eq('tenant_id', tenantUuid)
          .eq('status', 'completed')
          .is('deleted_at', null)
          .gte('created_at', start)
          .lt('created_at', end);

        if (!error && cloudSales) {
          salesData = cloudSales.map((s, i) => ({
            id: `cloud-${i}`,
            tenantId,
            totalBs: Number(s.total_bs) || 0,
            paymentMethod: s.payment_method || 'efectivo_bs',
            exchangeRate: Number(s.exchange_rate) || 1,
            createdAt: new Date().toISOString(),
          } as DexieSale & { exchangeRate: number }));
        }
      }

      const map = new Map<string, PaymentBreakdownData>();
      let grandTotal = 0;
      for (const sale of salesData) {
        grandTotal += sale.totalBs;
        const saleUsd = (sale as DexieSale & { exchangeRate?: number }).exchangeRate
          ? sale.totalBs / (sale as DexieSale & { exchangeRate: number }).exchangeRate
          : 0;
        const label = PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod;
        const existing = map.get(sale.paymentMethod);
        if (existing) {
          existing.count += 1;
          existing.totalBs = preciseRound(existing.totalBs + sale.totalBs, 2);
          existing.totalUsd = preciseRound(existing.totalUsd + saleUsd, 2);
        } else {
          map.set(sale.paymentMethod, {
            method: sale.paymentMethod,
            label,
            count: 1,
            totalBs: sale.totalBs,
            totalUsd: saleUsd,
            percentage: 0,
          });
        }
      }

      const result = Array.from(map.values());
      for (const item of result) {
        item.percentage = grandTotal > 0 ? preciseRound((item.totalBs / grandTotal) * 100, 2) : 0;
        item.totalBs = preciseRound(item.totalBs, 2);
        item.totalUsd = preciseRound(item.totalUsd, 2);
      }

      return success(result.sort((a, b) => b.totalBs - a.totalBs));
    } catch (err) {
      console.error('[reportsService.getPaymentBreakdown]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar desglose de pagos.'));
    }
  },

  async getCashAnalysis(tenantId: string, filters: ReportFilters): Promise<Result<CashRegisterSummaryData[], AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const filtersCheck = ReportsFiltersSchema.safeParse(filters);
    if (!filtersCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
    }
    try {
      const { start, end } = getDateRange(filters);
      const db = getDb();
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      let registers = await db.cashRegisters
        .where({ tenantId })
        .filter((r) => !r.deletedAt && r.createdAt >= start && r.createdAt <= end)
        .reverse()
        .sortBy('createdAt');

      // Merge Dexie + Supabase para cubrir cajas con tenantId UUID (sync corrupto)
      try {
        const { data: cloudRegs, error: regErr } = await supabase
          .from('cash_registers')
          .select('*')
          .eq('tenant_id', tenantUuid)
          .is('deleted_at', null)
          .gte('created_at', start)
          .lt('created_at', end);

        if (!regErr && cloudRegs && cloudRegs.length > 0) {
          // AUDIT-013: Offline-first merge (local authoritative until sync)
          const merged = new Map<string, typeof registers[0]>();
          // Insertar primero los de la nube (de respaldo)
          for (const r of cloudRegs) {
            merged.set(r.id as string, {
              id: r.id as string,
              tenantId,
              isOpen: r.is_open as boolean,
              openedBy: r.opened_by as string | null,
              openedAt: r.opened_at as string | null,
              openingBalanceBs: r.opening_balance_bs ? Number(r.opening_balance_bs) : 0,
              openingRate: r.opening_rate ? Number(r.opening_rate) : null,
              closedBy: r.closed_by as string | null,
              closedAt: r.closed_at as string | null,
              closingBalanceBs: r.closing_balance_bs ? Number(r.closing_balance_bs) : null,
              closingRate: r.closing_rate ? Number(r.closing_rate) : null,
              expectedClosingBs: r.expected_closing_bs ? Number(r.expected_closing_bs) : null,
              differenceBs: r.difference_bs ? Number(r.difference_bs) : null,
              totalSalesCount: Number(r.total_sales_count) || 0,
              totalSalesBs: Number(r.total_sales_bs) || 0,
              totalIgtfBs: Number(r.total_igtf_bs) || 0,
              createdAt: r.created_at as string,
              updatedAt: r.updated_at as string,
            });
          }
          // AUDIT-013: Locales pisan a la nube (autoridad offline-first)
          for (const r of registers) merged.set(r.id, r);
          registers = [...merged.values()].sort(
            (a, b) => b.createdAt.localeCompare(a.createdAt),
          );
        }
      } catch {
        // Fallback silencioso
      }

      // Get all completed sales in the range with their individual exchange rates
      let allSales = await db.sales
        .where('[tenantId+createdAt]')
        .between([tenantId, start], [tenantId, end])
        .filter((s) => !s.deletedAt && s.status === 'completed' && s.exchangeRate > 0)
        .toArray();

      // Merge Dexie + Supabase para ventas
      try {
        const { data: cloudSales, error: salesErr } = await supabase
          .from('sales')
          .select('id, user_id, total_bs, subtotal_bs, igtf_bs, iva_bs, exchange_rate, payment_method, status, created_at, subtotal_usd, iva_usd, igtf_usd, total_usd, discount_usd')
          .eq('tenant_id', tenantUuid)
          .eq('status', 'completed')
          .is('deleted_at', null)
          .gte('created_at', start)
          .lt('created_at', end);

        if (!salesErr && cloudSales && cloudSales.length > 0) {
          // AUDIT-013: Offline-first merge (local authoritative until sync)
          const mergedSales = new Map<string, typeof allSales[0]>();
          // Insertar primero los de la nube (de respaldo)
          for (const s of cloudSales) {
            mergedSales.set(s.id as string, {
              id: s.id as string,
              tenantId,
              userId: (s.user_id as string) || '',
              paymentMethod: (s.payment_method as PaymentMethod) || 'efectivo_bs',
              subtotalBs: Number(s.subtotal_bs) || 0,
              igtfBs: Number(s.igtf_bs) || 0,
              ivaBs: Number(s.iva_bs) || 0,
              totalBs: Number(s.total_bs) || 0,
              exchangeRate: Number(s.exchange_rate) || 0,
              status: (s.status as 'completed' | 'voided') || 'completed',
              createdAt: s.created_at as string,
              // POS-002 (C-6): USD persistidos
              subtotalUsd: Number(s.subtotal_usd) || 0,
              ivaUsd: Number(s.iva_usd) || 0,
              igtfUsd: Number(s.igtf_usd) || 0,
              totalUsd: Number(s.total_usd) || 0,
              discountUsd: Number(s.discount_usd) || 0,
            });
          }
          // AUDIT-013: Locales pisan a la nube (offline-first, autoridad local hasta sync)
          for (const s of allSales) mergedSales.set(s.id, s);
          allSales = [...mergedSales.values()];
        }
      } catch {
        // Fallback silencioso
      }

      // Pre-sort sales by createdAt for O(log N) register windowing
      allSales.sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

      const result: CashRegisterSummaryData[] = registers.map((r) => {
        const regStart = r.openedAt ?? r.createdAt;
        const regEnd = r.closedAt ?? end;

        // Binary search: find first index >= regStart
        let lo = 0, hi = allSales.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (allSales[mid].createdAt < regStart) lo = mid + 1; else hi = mid;
        }
        // Collect all sales within [regStart, regEnd]
        const regSales: typeof allSales = [];
        for (let i = lo; i < allSales.length && allSales[i].createdAt <= regEnd; i++) {
          regSales.push(allSales[i]);
        }

        // POS-002 (C-6): usar totalUsd persistido si está disponible; fallback a cálculo
        let totalSalesUsd = 0;
        for (const s of regSales) {
          if (s.totalUsd !== undefined && s.totalUsd > 0) {
            totalSalesUsd = preciseRound(totalSalesUsd + s.totalUsd, 2);
          } else if (s.exchangeRate > 0) {
            totalSalesUsd = preciseRound(totalSalesUsd + s.totalBs / s.exchangeRate, 2);
          }
        }
        totalSalesUsd = preciseRound(totalSalesUsd, 2);

        // Use openingRate for opening conversion
        const openingRate = r.openingRate && r.openingRate > 0 ? r.openingRate : 0;
        const openingBalanceUsd = openingRate > 0
          ? preciseRound((r.openingBalanceBs ?? 0) / openingRate, 2)
          : 0;

        // Use closingRate for closing conversion (fallback to openingRate)
        const closeRate = r.closingRate && r.closingRate > 0 ? r.closingRate : openingRate;
        const closingBalanceUsd = r.closingBalanceBs != null && closeRate > 0
          ? preciseRound(r.closingBalanceBs / closeRate, 2)
          : undefined;

        const expectedClosingUsd = openingRate > 0
          // AUDIT-014: Per-sale USD total (rate-stable). Suma de cada venta convertida a su propia tasa,
          // no recálculo desde Bs con openingRate (que es incorrecto cuando BCV se actualiza mid-day).
          ? preciseRound(openingBalanceUsd + totalSalesUsd, 2)
          : undefined;

        const differenceUsd = (r.differenceBs != null && closeRate > 0)
          ? preciseRound(r.differenceBs / closeRate, 2)
          : undefined;

        return {
          registerId: r.id,
          openedAt: r.openedAt ?? r.createdAt,
          closedAt: r.closedAt ?? undefined,
          openingBalanceBs: r.openingBalanceBs ?? 0,
          openingBalanceUsd,
          closingBalanceBs: r.closingBalanceBs ?? undefined,
          closingBalanceUsd,
          expectedClosingBs: r.expectedClosingBs ?? undefined,
          expectedClosingUsd,
          differenceBs: r.differenceBs ?? undefined,
          differenceUsd,
          totalSalesCount: r.totalSalesCount,
          totalSalesBs: r.totalSalesBs,
          totalSalesUsd,
          status: r.isOpen ? 'open' : 'closed',
        };
      });

      return success(result);
    } catch (err) {
      console.error('[reportsService.getCashAnalysis]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar analisis de caja.'));
    }
  },

  

  async getNonSellableExpenses(tenantId: string, start: string, end: string): Promise<Result<{ totalUsd: number; totalBs: number }, AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    try {
      const db = getDb();
      const nsProducts = await db.products
        .where({ tenantId })
        .filter((p) => !p.deletedAt && p.isSellable === false)
        .toArray();

      if (nsProducts.length === 0) return success({ totalUsd: 0, totalBs: 0 });

      const nsProductIds = new Set(nsProducts.map((p) => p.id));
      const lots = await db.inventoryLots
        .where({ tenantId })
        .filter((l) => !l.deletedAt && l.createdAt >= start && l.createdAt <= end)
        .toArray();

      let totalUsd = 0;
      let totalBs = 0;
      for (const lot of lots) {
        if (!nsProductIds.has(lot.productId)) continue;
        const cost = lot.costUsdPerUnit ?? 0;
        const lotUsd = lot.quantityAdded * cost;
        totalUsd += lotUsd;

        const rate = await getRateForDateCached(tenantId, lot.createdAt);
        if (rate > 0) totalBs += lotUsd * rate;
      }
      totalUsd = preciseRound(totalUsd, 2);
      totalBs = preciseRound(totalBs, 2);

      return success({ totalUsd, totalBs });
    } catch (err) {
      logger.error('Reports', 'Error al obtener gastos no vendibles', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener gastos no vendibles.'));
    }
  },

  async getAdjustmentLossExpenses(tenantId: string, start: string, end: string): Promise<Result<AdjustmentLossExpenses, AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    try {
      const db = getDb();
      // DINERO-010 (A5): incluir TODOS los movimientos con quantity<0 (no filtrar por costUsd>0).
      // Las pérdidas con costUsd null/undefined se estiman usando priceUsd*0.5.
      const movements = await db.inventoryMovements
        .where({ tenantId })
        .filter((m) =>
          !m.deletedAt
          && m.type === 'adjustment'
          && m.quantity < 0
          && m.createdAt >= start
          && m.createdAt <= end
        )
        .toArray();

      // Pre-load products for movements without costUsd (bulk, avoids N+1)
      const productIdsNeeded = new Set<string>();
      for (const mov of movements) {
        if (mov.costUsd === undefined || mov.costUsd <= 0) productIdsNeeded.add(mov.productId);
      }
      const productMap = new Map<string, { priceUsd: number; isWeighted: boolean }>();
      if (productIdsNeeded.size > 0) {
        const products = await db.products.bulkGet([...productIdsNeeded]);
        for (const p of products) {
          if (p) productMap.set(p.id, { priceUsd: p.priceUsd ?? 0, isWeighted: p.isWeighted ?? false });
        }
      }

      const LOSING_REASONS = ['perdida', 'robo', 'vencido', 'consumo_interno', 'otros'] as const;
      const byReason: Record<string, { totalUsd: number; totalBs: number; count: number; estimatedCount: number }> = {};
      for (const reason of LOSING_REASONS) {
        byReason[reason] = { totalUsd: 0, totalBs: 0, count: 0, estimatedCount: 0 };
      }

      let totalBs = 0;
      let totalUsd = 0;
      let estimatedTotalUsd = 0;

      for (const mov of movements) {
        const reason = mov.reasonType ?? 'otros';
        if (!byReason[reason]) byReason[reason] = { totalUsd: 0, totalBs: 0, count: 0, estimatedCount: 0 };

        let costUsd: number;
        let isEstimated = false;
        if (mov.costUsd !== undefined && mov.costUsd > 0) {
          costUsd = mov.costUsd;
        } else {
          // Estimación: |quantity| * priceUsd * 0.5 (costo fallback proporcional a unidades perdidas)
          const product = productMap.get(mov.productId);
          const priceUsd = product?.priceUsd ?? 0;
          let unitsLost = Math.abs(mov.quantity);
          if (product?.isWeighted) unitsLost = unitsLost / 1000;
          costUsd = preciseRound(unitsLost * priceUsd * 0.5, 4);
          isEstimated = true;
          estimatedTotalUsd += costUsd;
        }

        byReason[reason].totalUsd += costUsd;
        byReason[reason].count += 1;
        if (isEstimated) byReason[reason].estimatedCount += 1;
        totalUsd += costUsd;

        const rate = await getRateForDateCached(tenantId, mov.createdAt);
        if (rate > 0) {
          const movBs = preciseRound(costUsd * rate, 2);
          byReason[reason].totalBs += movBs;
          totalBs += movBs;
        }
      }
      totalUsd = preciseRound(totalUsd, 2);
      totalBs = preciseRound(totalBs, 2);
      estimatedTotalUsd = preciseRound(estimatedTotalUsd, 2);

      return success({
        perdida: { totalUsd: byReason['perdida'].totalUsd, count: byReason['perdida'].count, estimatedCount: byReason['perdida'].estimatedCount },
        robo: { totalUsd: byReason['robo'].totalUsd, count: byReason['robo'].count, estimatedCount: byReason['robo'].estimatedCount },
        vencido: { totalUsd: byReason['vencido'].totalUsd, count: byReason['vencido'].count, estimatedCount: byReason['vencido'].estimatedCount },
        consumo_interno: { totalUsd: byReason['consumo_interno'].totalUsd, count: byReason['consumo_interno'].count, estimatedCount: byReason['consumo_interno'].estimatedCount },
        otros: { totalUsd: byReason['otros'].totalUsd, count: byReason['otros'].count, estimatedCount: byReason['otros'].estimatedCount },
        totalUsd,
        totalBs,
        estimatedTotalUsd,
      });
    } catch (err) {
      logger.error('Reports', 'Error al obtener gastos por pérdidas', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener gastos por pérdidas.'));
    }
  },

  async getSalesDetail(tenantId: string, filters: ReportFilters): Promise<Result<SaleDetail[], AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const filtersCheck = ReportsFiltersSchema.safeParse(filters);
    if (!filtersCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
    }
    try {
      requireRole('owner', 'admin');
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      const sales: SaleDetail[] = data.map(({ sale, items }) => {
        const dateObj = new Date(sale.createdAt);
        const ivaBs = sale.ivaBs || 0;
        const ivaUsd = sale.exchangeRate > 0 ? preciseRound(ivaBs / sale.exchangeRate, 2) : 0;
        // DINERO-014 (M4): subtotal = total - IVA
        const subtotalBs = preciseRound(sale.totalBs - ivaBs, 2);
        const subtotalUsd = sale.exchangeRate > 0 ? preciseRound(subtotalBs / sale.exchangeRate, 2) : 0;
        return {
          id: sale.id,
          date: dateObj.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }),
          time: dateObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
          itemCount: items.length,
          subtotalBs,
          subtotalUsd,
          ivaBs,
          ivaUsd,
          totalBs: sale.totalBs,
          totalUsd: sale.exchangeRate > 0 ? preciseRound(sale.totalBs / sale.exchangeRate, 2) : 0,
          paymentMethod: sale.paymentMethod,
        };
      });

      sales.sort((a, b) => new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime());
      return success(sales);
    } catch (err) {
      console.error('[reportsService.getSalesDetail]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener detalle de ventas.'));
    }
  },

  async getExpenseBreakdown(tenantId: string, filters: ReportFilters): Promise<Result<ExpenseBreakdownItem[], AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const filtersCheck = ReportsFiltersSchema.safeParse(filters);
    if (!filtersCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
    }
    try {
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      let totalCostBs = 0;
      let totalCostUsd = 0;
      for (const { sale, items } of data) {
        for (const item of items) {
          totalCostUsd += item.costUsdPerUnit ? preciseRound(effectiveItemQuantity(item) * item.costUsdPerUnit, 2) : 0;
          totalCostBs += calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate, item.unitMultiplier);
        }
      }

      const items: ExpenseBreakdownItem[] = [];

      if (totalCostUsd > 0) {
        items.push({
          type: 'costo_ventas',
          label: 'Costo de Compras',
          amountBs: preciseRound(totalCostBs, 2),
          amountUsd: preciseRound(totalCostUsd, 2),
        });
      }

      const nsResult = await this.getNonSellableExpenses(tenantId, start, end);
      if (nsResult.ok && nsResult.data.totalUsd > 0) {
        items.push({
          type: 'no_vendibles',
          label: 'Gastos No Vendibles',
          amountBs: nsResult.data.totalBs,
          amountUsd: nsResult.data.totalUsd,
        });
      }

      const adjResult = await this.getAdjustmentLossExpenses(tenantId, start, end);
      if (adjResult.ok) {
        const reasons = adjResult.data as AdjustmentLossExpenses;
        const REASON_LABELS: Record<string, string> = {
          perdida: 'Pérdida',
          robo: 'Robo',
          vencido: 'Vencido',
          consumo_interno: 'Consumo Interno',
          otros: 'Otros',
        };
        for (const [reason, val] of Object.entries(reasons)) {
          if (reason === 'totalUsd' || reason === 'totalBs' || reason === 'estimatedTotalUsd') continue;
          if (val.count > 0) {
            const ratio = adjResult.data.totalUsd > 0 ? val.totalUsd / adjResult.data.totalUsd : 0;
            items.push({
              type: reason,
              label: REASON_LABELS[reason] ?? reason,
              amountBs: ratio > 0 ? preciseRound(ratio * adjResult.data.totalBs, 2) : 0,
              amountUsd: val.totalUsd,
            });
          }
        }
      }

      // Operating expenses breakdown
      // BACKLOG-106 [REPORTS-001]: Excluir COMPRA_INVENTARIO del desglose (el costo ya se refleja en COGS).
      const db = getDb();
      const startNorm = start.slice(0, 10);
      const endNorm = end.slice(0, 10);
      const operatingExpenses = await db.expenses
        .where('[tenantId+date]')
        .between([tenantId, startNorm], [tenantId, endNorm])
        .filter((e) => !e.deletedAt && !e.isRecurring && e.status === 'paid' && e.category !== 'COMPRA_INVENTARIO')
        .toArray();

      if (operatingExpenses.length > 0) {
        const byCategory = new Map<string, { amountUsd: number; amountBs: number }>();
        for (const exp of operatingExpenses) {
          const curr = byCategory.get(exp.category) ?? { amountUsd: 0, amountBs: 0 };
          curr.amountUsd += exp.amountUsd;
          curr.amountBs += exp.amountBs;
          byCategory.set(exp.category, curr);
        }
        for (const [category, val] of byCategory) {
          items.push({
            type: 'operating',
            label: category,
            amountBs: preciseRound(val.amountBs, 2),
            amountUsd: preciseRound(val.amountUsd, 2),
          });
        }
      }

      return success(items);
    } catch (err) {
      console.error('[reportsService.getExpenseBreakdown]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener desglose de gastos.'));
    }
  },

  async getTicketDistribution(tenantId: string, filters: ReportFilters): Promise<Result<TicketDistributionItem[], AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const filtersCheck = ReportsFiltersSchema.safeParse(filters);
    if (!filtersCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
    }
    try {
      const { start, end } = getDateRange(filters);
      const db = getDb();
      const sales = await db.sales
        .where('[tenantId+createdAt]')
        .between([tenantId, start], [tenantId, end])
        .filter((s) => !s.deletedAt && s.status === 'completed')
        .toArray();

      let salesData = sales;

      if (salesData.length === 0) {
        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        const { data: cloudSales } = await supabase
          .from('sales')
          .select('total_bs, exchange_rate')
          .eq('tenant_id', tenantUuid)
          .eq('status', 'completed')
          .is('deleted_at', null)
          .gte('created_at', start)
          .lt('created_at', end);
        if (cloudSales) {
          salesData = cloudSales.map((s) => {
            const sale = s as { total_bs: number; exchange_rate: number };
            return {
              id: `cloud-${Math.random()}`,
              tenantId,
              totalBs: Number(sale.total_bs) || 0,
              exchangeRate: Number(sale.exchange_rate) || 1,
              createdAt: '',
              status: 'completed' as const,
              paymentMethod: '',
              userId: '',
              subtotalBs: Number(sale.total_bs) || 0,
              ivaBs: 0,
              igtfBs: 0,
              deletedAt: undefined,
              syncedAt: undefined,
            } as unknown as DexieSale;
          });
        }
      }

      const RANGES = [
        { min: 0, max: 5, label: 'Menos de $5' },
        { min: 5, max: 20, label: '$5 – $20' },
        { min: 20, max: 50, label: '$20 – $50' },
        { min: 50, max: 100, label: '$50 – $100' },
        { min: 100, max: Infinity, label: 'Más de $100' },
      ];

      const buckets = new Array(RANGES.length).fill(0);
      for (const sale of salesData) {
        const usdAmount = sale.exchangeRate > 0 ? sale.totalBs / sale.exchangeRate : 0;
        for (let i = 0; i < RANGES.length; i++) {
          if (usdAmount >= RANGES[i].min && usdAmount < RANGES[i].max) {
            buckets[i]++;
            break;
          }
        }
      }

      const total = salesData.length;
      let cumulative = 0;
      const result: TicketDistributionItem[] = RANGES.map((r, i) => {
        cumulative += buckets[i];
        return {
          range: r.label,
          count: buckets[i],
          percentage: total > 0 ? preciseRound((buckets[i] / total) * 100, 1) : 0,
          cumulative: total > 0 ? preciseRound((cumulative / total) * 100, 1) : 0,
        };
      });

      // Eliminar rangos vacíos al final para que el acumulado no muestre 100% en una fila con 0 ventas
      while (result.length > 1 && result[result.length - 1].count === 0) {
        result.pop();
      }

      return success(result);
    } catch (err) {
      console.error('[reportsService.getTicketDistribution]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener distribución de tickets.'));
    }
  },

  async getDiscountBreakdown(tenantId: string, filters: ReportFilters): Promise<Result<DiscountBreakdownItem[], AppError>> {
    const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const filtersCheck = ReportsFiltersSchema.safeParse(filters);
    if (!filtersCheck.success) {
      return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
    }
    try {
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      const discounted = data
        .filter((d) => d.sale.discountBs && d.sale.discountBs > 0)
        .map((d) => ({
          saleId: d.sale.id,
          date: d.sale.createdAt.slice(0, 10),
          discountBs: preciseRound(d.sale.discountBs || 0, 2),
          discountUsd: d.sale.exchangeRate > 0 ? preciseRound((d.sale.discountBs || 0) / d.sale.exchangeRate, 2) : 0,
          subtotalBs: preciseRound(d.sale.totalBs + (d.sale.discountBs || 0), 2),
          totalBs: d.sale.totalBs,
          paymentMethod: d.sale.paymentMethod,
        }))
        .sort((a, b) => b.discountBs - a.discountBs);

      return success(discounted);
    } catch (err) {
      console.error('[reportsService.getDiscountBreakdown]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener desglose de descuentos.'));
    }
  },
};
