import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { getDb, type DexieSale } from '../../../services/dexie/db';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { ReportsErrors } from '../../../specs/reports/errors';
import { logger } from '../../../lib/logger';
import { startOfDayVzla, endOfDayVzla } from '../../../lib/date';
import type {
  ReportFilters,
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
  AdjustmentLossExpenses,
  SaleDetail,
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
    exchangeRate: number;
    paymentMethod: string;
    createdAt: string;
  };
  items: {
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitPriceUsd: number;
    costUsdPerUnit?: number;
  }[];
}

async function fetchSalesWithItems(tenantId: string, start: string, end: string): Promise<SaleWithItems[]> {
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
      .toArray();

    // Si hay ventas pero NO hay items, es una race condition de sync
    // (sales se sincroniza antes que sale_items). Caemos a Supabase.
    if (allItems.length > 0) {
      const itemsBySaleId = new Map<string, typeof allItems>();
      for (const item of allItems) {
        const group = itemsBySaleId.get(item.saleId);
        if (group) group.push(item);
        else itemsBySaleId.set(item.saleId, [item]);
      }

      return sales.map((sale) => ({
        sale: {
          id: sale.id,
          totalBs: sale.totalBs,
          igtfBs: sale.igtfBs,
          exchangeRate: sale.exchangeRate,
          paymentMethod: sale.paymentMethod,
          createdAt: sale.createdAt,
        },
        items: (itemsBySaleId.get(sale.id) ?? []).map((i) => ({
          productId: i.productId,
          productName: i.productName,
          productSku: i.productSku,
          quantity: i.quantity,
          unitPriceUsd: i.unitPriceUsd,
          costUsdPerUnit: i.costUsdPerUnit,
        })),
      }));
    }
  }

  // Fallback a Supabase si Dexie está vacío o hay race condition de sync
  try {
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const { data: cloudSales, error: salesError } = await supabase
      .from('sales')
      .select('id, total_bs, igtf_bs, exchange_rate, payment_method, created_at')
      .eq('tenant_id', tenantUuid)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .gte('created_at', start)
      .lt('created_at', end);

    if (salesError || !cloudSales || cloudSales.length === 0) return [];

    const saleIds = cloudSales.map((s) => s.id);
    const { data: cloudItems, error: itemsError } = await supabase
      .from('sale_items')
      .select('sale_id, product_id, product_name, product_sku, quantity, unit_price_usd, cost_usd_per_unit')
      .in('sale_id', saleIds);

    if (itemsError || !cloudItems) return [];

    const itemsBySaleId = new Map<string, typeof cloudItems>();
    for (const item of cloudItems) {
      const sId = item.sale_id;
      if (!itemsBySaleId.has(sId)) itemsBySaleId.set(sId, []);
      itemsBySaleId.get(sId)!.push(item);
    }

    return cloudSales.map((sale) => ({
      sale: {
        id: sale.id,
        totalBs: Number(sale.total_bs) || 0,
        igtfBs: Number(sale.igtf_bs) || 0,
        exchangeRate: Number(sale.exchange_rate) || 1,
        paymentMethod: sale.payment_method || 'efectivo_bs',
        createdAt: sale.created_at,
      },
      items: (itemsBySaleId.get(sale.id) ?? []).map((i) => ({
        productId: i.product_id,
        productName: i.product_name || '',
        productSku: i.product_sku || '',
        quantity: Number(i.quantity),
        unitPriceUsd: Number(i.unit_price_usd) || 0,
        costUsdPerUnit: i.cost_usd_per_unit ? Number(i.cost_usd_per_unit) : undefined,
      })),
    }));
  } catch {
    return [];
  }
}

function calcItemCostBs(quantity: number, costUsdPerUnit: number | undefined, exchangeRate: number): number {
  if (!costUsdPerUnit || costUsdPerUnit <= 0) return 0;
  return preciseRound(quantity * costUsdPerUnit * exchangeRate, 2);
}

export const reportsService = {
  async getExecutiveSummary(tenantId: string, filters: ReportFilters): Promise<Result<ExecutiveSummaryData, AppError>> {
    try {
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      let totalSalesBs = 0;
      let totalSalesUsd = 0;
      let totalCostBs = 0;
      let totalCostUsd = 0;
      const productProfitMap = new Map<string, { name: string; profit: number }>();

      for (const { sale, items } of data) {
        totalSalesBs += sale.totalBs;
        const saleUsd = sale.exchangeRate > 0 ? sale.totalBs / sale.exchangeRate : 0;
        totalSalesUsd += saleUsd;
        for (const item of items) {
          const costBs = calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate);
          const costUsd = item.costUsdPerUnit ? preciseRound(item.quantity * item.costUsdPerUnit, 2) : 0;
          const revenueBs = preciseRound(item.quantity * item.unitPriceUsd * sale.exchangeRate, 2);
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
      totalCostBs = preciseRound(totalCostBs, 2);
      totalCostUsd = preciseRound(totalCostUsd, 2);
      const grossProfitBs = preciseRound(totalSalesBs - totalCostBs, 2);
      const grossProfitUsd = preciseRound(totalSalesUsd - totalCostUsd, 2);
      const profitMarginPercent = totalSalesBs > 0 ? preciseRound((grossProfitBs / totalSalesBs) * 100, 2) : 0;
      const totalTransactions = data.length;
      const averageTicketBs = totalTransactions > 0 ? preciseRound(totalSalesBs / totalTransactions, 2) : 0;
      const averageTicketUsd = totalTransactions > 0 ? preciseRound(totalSalesUsd / totalTransactions, 2) : 0;

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
        perdida: { totalUsd: 0, count: 0 },
        robo: { totalUsd: 0, count: 0 },
        vencido: { totalUsd: 0, count: 0 },
        consumo_interno: { totalUsd: 0, count: 0 },
        otros: { totalUsd: 0, count: 0 },
        totalUsd: 0,
        totalBs: 0,
      };
      const totalExpensesUsd = preciseRound(nonSellableExpensesUsd + adjustmentLossExpenses.totalUsd, 2);
      const totalExpensesBs = preciseRound(nonSellableExpensesBs + adjustmentLossExpenses.totalBs, 2);
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
        const ySales = yData.reduce((sum, d) => sum + d.sale.totalBs, 0);
        if (ySales > 0) {
          salesVsYesterdayPercent = preciseRound(((totalSalesBs - ySales) / ySales) * 100, 2);
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
        totalExpensesUsd,
        totalExpensesBs,
        netProfitUsd,
        netProfitBs,
      });
    } catch (err) {
      console.error('[reportsService.getExecutiveSummary]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar el resumen ejecutivo.'));
    }
  },

  async getProfitOverTime(tenantId: string, filters: ReportFilters): Promise<Result<DailyProfitPoint[], AppError>> {
    try {
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      const map = new Map<string, DailyProfitPoint>();
      for (const { sale } of data) {
        const dateKey = sale.createdAt.slice(0, 10);
        const label = new Date(dateKey).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
        if (!map.has(dateKey)) {
          map.set(dateKey, { date: dateKey, label, salesBs: 0, salesUsd: 0, costBs: 0, costUsd: 0, profitBs: 0, profitUsd: 0, transactions: 0, lastRate: sale.exchangeRate });
        }
        const point = map.get(dateKey)!;
        point.salesBs += sale.totalBs;
        point.salesUsd += sale.exchangeRate > 0 ? sale.totalBs / sale.exchangeRate : 0;
        point.transactions += 1;
        point.lastRate = sale.exchangeRate;
      }

      for (const { sale, items } of data) {
        const dateKey = sale.createdAt.slice(0, 10);
        const point = map.get(dateKey)!;
        for (const item of items) {
          point.costBs += calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate);
          point.costUsd += item.costUsdPerUnit ? preciseRound(item.quantity * item.costUsdPerUnit, 2) : 0;
        }
      }

      const sorted = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
      for (const point of sorted) {
        point.salesBs = preciseRound(point.salesBs, 2);
        point.salesUsd = preciseRound(point.salesUsd, 2);
        point.costBs = preciseRound(point.costBs, 2);
        point.costUsd = preciseRound(point.costUsd, 2);
        point.profitBs = preciseRound(point.salesBs - point.costBs, 2);
        point.profitUsd = preciseRound(point.salesUsd - point.costUsd, 2);
        point.lastRate = preciseRound(point.lastRate, 4);
      }

      return success(sorted);
    } catch (err) {
      console.error('[reportsService.getProfitOverTime]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar grafico de ganancias.'));
    }
  },

  async getTopProducts(tenantId: string, filters: ReportFilters, limit = 10): Promise<Result<TopProductData[], AppError>> {
    try {
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      const map = new Map<string, TopProductData>();
      for (const { sale, items } of data) {
        for (const item of items) {
          const existing = map.get(item.productId);
          const revenueBs = preciseRound(item.quantity * item.unitPriceUsd * sale.exchangeRate, 2);
          const revenueUsd = preciseRound(item.quantity * item.unitPriceUsd, 2);
          const costBs = calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate);
          const costUsd = item.costUsdPerUnit ? preciseRound(item.quantity * item.costUsdPerUnit, 2) : 0;
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
            map.set(item.productId, {
              productId: item.productId,
              name: item.productName,
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

  async getPaymentBreakdown(tenantId: string, filters: ReportFilters): Promise<Result<PaymentBreakdownData[], AppError>> {
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
    try {
      const { start, end } = getDateRange(filters);
      const db = getDb();
      const registers = await db.cashRegisters
        .where({ tenantId })
        .filter((r) => !r.deletedAt && r.createdAt >= start && r.createdAt <= end)
        .reverse()
        .sortBy('createdAt');

      // Get all completed sales in the range with their individual exchange rates
      const allSales = await db.sales
        .where('[tenantId+createdAt]')
        .between([tenantId, start], [tenantId, end])
        .filter((s) => !s.deletedAt && s.status === 'completed' && s.exchangeRate > 0)
        .toArray();

      const result: CashRegisterSummaryData[] = registers.map((r) => {
        // Filter sales that belong to this register (by time range)
        const regStart = r.openedAt ?? r.createdAt;
        const regEnd = r.closedAt ?? end;
        const regSales = allSales.filter((s) => s.createdAt >= regStart && s.createdAt <= regEnd);

        // Calculate totalSalesUsd from individual sales' own exchangeRate
        let totalSalesUsd = 0;
        for (const s of regSales) {
          totalSalesUsd += preciseRound(s.totalBs / s.exchangeRate, 2);
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
          ? preciseRound(((r.openingBalanceBs ?? 0) + r.totalSalesBs) / openingRate, 2)
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
        .filter((l) => l.createdAt >= start && l.createdAt <= end)
        .toArray();

      let totalUsd = 0;
      for (const lot of lots) {
        if (!nsProductIds.has(lot.productId)) continue;
        const cost = lot.costUsdPerUnit ?? 0;
        totalUsd += lot.quantityAdded * cost;
      }
      totalUsd = preciseRound(totalUsd, 2);

      // Get exchange rate for the period from the exchangeRates table
      const nsExchangeRates = await db.exchangeRates
        .where('tenantId')
        .equals(tenantId)
        .reverse()
        .sortBy('createdAt');
      const nsPeriodRate = nsExchangeRates.length > 0 ? nsExchangeRates[0].rate : 0;

      const totalBs = nsPeriodRate > 0 ? preciseRound(totalUsd * nsPeriodRate, 2) : 0;

      return success({ totalUsd, totalBs });
    } catch (err) {
      logger.error('Reports', 'Error al obtener gastos no vendibles', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener gastos no vendibles.'));
    }
  },

  async getAdjustmentLossExpenses(tenantId: string, start: string, end: string): Promise<Result<AdjustmentLossExpenses, AppError>> {
    try {
      const db = getDb();
      const movements = await db.inventoryMovements
        .where({ tenantId })
        .filter((m) =>
          m.type === 'adjustment'
          && m.quantity < 0
          && m.createdAt >= start
          && m.createdAt <= end
          && m.costUsd !== undefined
          && m.costUsd > 0
        )
        .toArray();

      const LOSING_REASONS = ['perdida', 'robo', 'vencido', 'consumo_interno', 'otros'] as const;
      const byReason: Record<string, { totalUsd: number; count: number }> = {};
      for (const reason of LOSING_REASONS) {
        byReason[reason] = { totalUsd: 0, count: 0 };
      }

      let totalUsd = 0;
      for (const mov of movements) {
        const reason = mov.reasonType ?? 'otros';
        if (!byReason[reason]) byReason[reason] = { totalUsd: 0, count: 0 };
        byReason[reason].totalUsd += mov.costUsd!;
        byReason[reason].count += 1;
        totalUsd += mov.costUsd!;
      }
      totalUsd = preciseRound(totalUsd, 2);

      // Get exchange rate for the period from the exchangeRates table
      const adjExchangeRates = await db.exchangeRates
        .where('tenantId')
        .equals(tenantId)
        .reverse()
        .sortBy('createdAt');
      const adjPeriodRate = adjExchangeRates.length > 0 ? adjExchangeRates[0].rate : 0;

      const totalBs = adjPeriodRate > 0 ? preciseRound(totalUsd * adjPeriodRate, 2) : 0;

      return success({
        perdida: byReason['perdida'],
        robo: byReason['robo'],
        vencido: byReason['vencido'],
        consumo_interno: byReason['consumo_interno'],
        otros: byReason['otros'],
        totalUsd,
        totalBs,
      });
    } catch (err) {
      logger.error('Reports', 'Error al obtener gastos por pérdidas', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener gastos por pérdidas.'));
    }
  },

  async getSalesDetail(tenantId: string, filters: ReportFilters): Promise<Result<SaleDetail[], AppError>> {
    try {
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      const sales: SaleDetail[] = data.map(({ sale, items }) => {
        const dateObj = new Date(sale.createdAt);
        return {
          id: sale.id,
          date: dateObj.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }),
          time: dateObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
          itemCount: items.length,
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
    try {
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);

      let totalCostBs = 0;
      let totalCostUsd = 0;
      for (const { sale, items } of data) {
        for (const item of items) {
          totalCostUsd += item.costUsdPerUnit ? preciseRound(item.quantity * item.costUsdPerUnit, 2) : 0;
          totalCostBs += calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate);
        }
      }

      const db = getDb();
      const periodSales = await db.sales
        .where('[tenantId+createdAt]')
        .between([tenantId, start], [tenantId, end])
        .filter((s) => !s.deletedAt && s.status === 'completed' && s.exchangeRate > 0)
        .toArray();
      const avgRate = periodSales.length > 0
        ? periodSales.reduce((sum, s) => sum + s.exchangeRate, 0) / periodSales.length
        : 0;

      const items: ExpenseBreakdownItem[] = [];

      if (totalCostUsd > 0) {
        items.push({
          type: 'costo_ventas',
          label: 'Costo de Ventas',
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
          if (reason === 'totalUsd' || reason === 'totalBs') continue;
          if (val.count > 0) {
            items.push({
              type: reason,
              label: REASON_LABELS[reason] ?? reason,
              amountBs: avgRate > 0 ? preciseRound(val.totalUsd * avgRate, 2) : 0,
              amountUsd: val.totalUsd,
            });
          }
        }
      }

      return success(items);
    } catch (err) {
      console.error('[reportsService.getExpenseBreakdown]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener desglose de gastos.'));
    }
  },

  async getTicketDistribution(tenantId: string, filters: ReportFilters): Promise<Result<TicketDistributionItem[], AppError>> {
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

      return success(result);
    } catch (err) {
      console.error('[reportsService.getTicketDistribution]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener distribución de tickets.'));
    }
  },
};
