import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { ReportsErrors } from '../../../specs/reports/errors';
import type {
  ReportFilters,
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
  CategoryProfitData,
} from '../types';

const PAYMENT_LABELS: Record<string, string> = {
  efectivo_bs: 'Efectivo Bs',
  pago_movil: 'Pago Móvil',
  tarjeta_bs: 'Tarjeta Bs',
  efectivo_usd: 'Efectivo USD',
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getDateRange(filters: ReportFilters): { start: string; end: string } {
  const now = new Date();
  let start: Date;
  let end: Date = endOfDay(now);

  switch (filters.timeRange) {
    case 'today':
      start = startOfDay(now);
      break;
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = startOfDay(y);
      end = endOfDay(y);
      break;
    }
    case 'last7days': {
      start = new Date(now);
      start.setDate(start.getDate() - 6);
      start = startOfDay(start);
      break;
    }
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'lastMonth': {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start = lm;
      end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      break;
    }
    case 'custom':
      start = filters.startDate ? startOfDay(new Date(filters.startDate)) : startOfDay(now);
      end = filters.endDate ? endOfDay(new Date(filters.endDate)) : endOfDay(now);
      break;
    default:
      start = startOfDay(now);
  }

  return { start: start.toISOString(), end: end.toISOString() };
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

  if (sales.length === 0) return [];

  const saleIds = sales.map((s) => s.id);
  const allItems = await db.saleItems
    .where('saleId')
    .anyOf(saleIds)
    .toArray();

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
      let totalCostBs = 0;
      let totalIgtfBs = 0;
      const productProfitMap = new Map<string, { name: string; profit: number }>();

      for (const { sale, items } of data) {
        totalSalesBs += sale.totalBs;
        totalIgtfBs += sale.igtfBs;
        for (const item of items) {
          const costBs = calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate);
          const revenueBs = preciseRound(item.quantity * item.unitPriceUsd * sale.exchangeRate, 2);
          totalCostBs += costBs;

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
      totalCostBs = preciseRound(totalCostBs, 2);
      const grossProfitBs = preciseRound(totalSalesBs - totalCostBs - totalIgtfBs, 2);
      const profitMarginPercent = totalSalesBs > 0 ? preciseRound((grossProfitBs / totalSalesBs) * 100, 2) : 0;
      const totalTransactions = data.length;
      const averageTicketBs = totalTransactions > 0 ? preciseRound(totalSalesBs / totalTransactions, 2) : 0;

      let topProductName: string | undefined;
      let maxProfit = -Infinity;
      for (const [, val] of productProfitMap) {
        if (val.profit > maxProfit) {
          maxProfit = val.profit;
          topProductName = val.name;
        }
      }

      // Comparacion vs ayer
      let salesVsYesterdayPercent: number | undefined;
      if (filters.timeRange === 'today') {
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        const yStart = startOfDay(yest).toISOString();
        const yEnd = endOfDay(yest).toISOString();
        const yData = await fetchSalesWithItems(tenantId, yStart, yEnd);
        const ySales = yData.reduce((sum, d) => sum + d.sale.totalBs, 0);
        if (ySales > 0) {
          salesVsYesterdayPercent = preciseRound(((totalSalesBs - ySales) / ySales) * 100, 2);
        }
      }

      return success({
        totalSalesBs,
        totalCostBs,
        grossProfitBs,
        profitMarginPercent,
        totalTransactions,
        averageTicketBs,
        totalIgtfBs: preciseRound(totalIgtfBs, 2),
        topProductName,
        salesVsYesterdayPercent,
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
          map.set(dateKey, { date: dateKey, label, salesBs: 0, costBs: 0, profitBs: 0, transactions: 0 });
        }
        const point = map.get(dateKey)!;
        point.salesBs += sale.totalBs;
        point.transactions += 1;
      }

      for (const { sale, items } of data) {
        const dateKey = sale.createdAt.slice(0, 10);
        const point = map.get(dateKey)!;
        for (const item of items) {
          point.costBs += calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate);
        }
      }

      const sorted = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
      for (const point of sorted) {
        point.salesBs = preciseRound(point.salesBs, 2);
        point.costBs = preciseRound(point.costBs, 2);
        point.profitBs = preciseRound(point.salesBs - point.costBs, 2);
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
          const costBs = calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate);
          const profitBs = preciseRound(revenueBs - costBs, 2);

          if (existing) {
            existing.quantitySold += item.quantity;
            existing.revenueBs = preciseRound(existing.revenueBs + revenueBs, 2);
            existing.costBs = preciseRound(existing.costBs + costBs, 2);
            existing.profitBs = preciseRound(existing.profitBs + profitBs, 2);
          } else {
            map.set(item.productId, {
              productId: item.productId,
              name: item.productName,
              sku: item.productSku,
              quantitySold: item.quantity,
              revenueBs,
              costBs,
              profitBs,
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

      const map = new Map<string, PaymentBreakdownData>();
      let grandTotal = 0;
      for (const sale of sales) {
        grandTotal += sale.totalBs;
        const label = PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod;
        const existing = map.get(sale.paymentMethod);
        if (existing) {
          existing.count += 1;
          existing.totalBs = preciseRound(existing.totalBs + sale.totalBs, 2);
        } else {
          map.set(sale.paymentMethod, {
            method: sale.paymentMethod,
            label,
            count: 1,
            totalBs: sale.totalBs,
            percentage: 0,
          });
        }
      }

      const result = Array.from(map.values());
      for (const item of result) {
        item.percentage = grandTotal > 0 ? preciseRound((item.totalBs / grandTotal) * 100, 2) : 0;
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

      const result: CashRegisterSummaryData[] = registers.map((r) => ({
        registerId: r.id,
        openedAt: r.openedAt ?? r.createdAt,
        closedAt: r.closedAt ?? undefined,
        openingBalanceBs: r.openingBalanceBs ?? 0,
        closingBalanceBs: r.closingBalanceBs ?? undefined,
        expectedClosingBs: r.expectedClosingBs ?? undefined,
        differenceBs: r.differenceBs ?? undefined,
        totalSalesCount: r.totalSalesCount,
        totalSalesBs: r.totalSalesBs,
        totalIgtfBs: r.totalIgtfBs,
        status: r.isOpen ? 'open' : 'closed',
      }));

      return success(result);
    } catch (err) {
      console.error('[reportsService.getCashAnalysis]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar analisis de caja.'));
    }
  },

  async getCategoryProfit(tenantId: string, filters: ReportFilters): Promise<Result<CategoryProfitData[], AppError>> {
    try {
      const { start, end } = getDateRange(filters);
      const data = await fetchSalesWithItems(tenantId, start, end);
      const db = getDb();

      const map = new Map<string, CategoryProfitData>();
      for (const { sale } of data) {
        const items = await db.saleItems.where({ saleId: sale.id }).toArray();
        for (const item of items) {
          const product = await db.products.get(item.productId);
          const categoryId = product?.categoryId;
          const categoryName = 'Sin categoría';

          const revenueBs = preciseRound(item.quantity * item.unitPriceUsd * sale.exchangeRate, 2);
          const costBs = calcItemCostBs(item.quantity, item.costUsdPerUnit, sale.exchangeRate);
          const profitBs = preciseRound(revenueBs - costBs, 2);

          const key = categoryId ?? '__none__';
          const existing = map.get(key);
          if (existing) {
            existing.revenueBs = preciseRound(existing.revenueBs + revenueBs, 2);
            existing.costBs = preciseRound(existing.costBs + costBs, 2);
            existing.profitBs = preciseRound(existing.profitBs + profitBs, 2);
          } else {
            map.set(key, {
              categoryId,
              categoryName,
              revenueBs,
              costBs,
              profitBs,
              marginPercent: revenueBs > 0 ? preciseRound((profitBs / revenueBs) * 100, 2) : 0,
            });
          }
        }
      }

      // Resolve category names
      for (const [, val] of map) {
        if (val.categoryId) {
          const cat = await db.categories.get(val.categoryId);
          if (cat) val.categoryName = cat.name;
        }
        val.marginPercent = val.revenueBs > 0 ? preciseRound((val.profitBs / val.revenueBs) * 100, 2) : 0;
      }

      return success(Array.from(map.values()).sort((a, b) => b.profitBs - a.profitBs));
    } catch (err) {
      console.error('[reportsService.getCategoryProfit]', err);
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar ganancia por categoria.'));
    }
  },
};
