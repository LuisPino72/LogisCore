import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { ReportsErrors } from '../../../specs/reports/errors';
import { ReportsFiltersSchema, ValidateTenantInputSchema } from '../../../specs/reports/index';
import { startOfDayVzla, endOfDayVzla } from '../../../lib/date';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { getPermissionMessage } from '../../auth/permissions/messages';
import type { ReportFilters, ExecutiveSummaryData } from '../types';
import { getDateRange, fetchSalesWithItems, effectiveItemQuantity, calcItemCostBs } from './reportsHelpers';
import { getNonSellableExpenses } from './expensesService';
import { getAdjustmentLossExpenses } from './expensesService';

export async function getExecutiveSummary(tenantId: string, filters: ReportFilters): Promise<Result<ExecutiveSummaryData, AppError>> {
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
  }
  const filtersCheck = ReportsFiltersSchema.safeParse(filters);
  if (!filtersCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_FILTERS, filtersCheck.error.issues[0]?.message || 'Filtros inválidos.'));
  }
  try {
    const session = useAuthStore.getState().session;
    if (!session || !hasActionPermission(session, 'reports', 'read')) {
      return failure(new AppError('AUTH_SCOPE_DENIED', getPermissionMessage('reports', 'read')));
    }
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
    let pendingCreditUsd = 0;
    let collectedCreditUsd = 0;
    const customerDebtMap = new Map<string, number>();
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
        // MED-1: revenue sin round por línea, solo al final al acumular
        const revenueBs = item.quantity * item.unitPriceUsd * sale.exchangeRate;
        const revenueUsd = item.quantity * item.unitPriceUsd;
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

    // Build set of credit sale IDs in period (for R4: fetch payments regardless of date)
    const creditSaleIdsInPeriod = new Set(data.filter(d => d.sale.isCreditSale).map(d => d.sale.id));

    // Non-sellable expenses + Adjustment losses + Operating expenses + Credit payments (parallel, no dependency)
    const [nsResult, adjResult, operatingExpenses, creditPaymentsArr] = await Promise.all([
      getNonSellableExpenses(tenantId, start, end),
      getAdjustmentLossExpenses(tenantId, start, end),
      (async () => {
        const db = getDb();
        const startNorm = start.slice(0, 10);
        const endNorm = end.slice(0, 10);
        return db.expenses
          .where('[tenantId+date]')
          .between([tenantId, startNorm], [tenantId, endNorm])
          .filter((e) => !e.deletedAt && !e.isRecurring && e.status === 'paid' && e.category !== 'COMPRA_INVENTARIO')
          .toArray();
      })(),
      (async () => {
        const db = getDb();
        // R4: fetch payments for period's credit sales (any date) + payments in period (orphan)
        if (creditSaleIdsInPeriod.size > 0) {
          const [paymentsForPeriodSales, paymentsInPeriod] = await Promise.all([
            db.creditPayments
              .where({ tenantId })
              .filter((cp) => creditSaleIdsInPeriod.has(cp.saleId) && !cp.deletedAt)
              .toArray(),
            db.creditPayments
              .where({ tenantId })
              .filter((cp) => cp.createdAt >= start && cp.createdAt <= end && !creditSaleIdsInPeriod.has(cp.saleId))
              .toArray(),
          ]);
          return [...paymentsForPeriodSales, ...paymentsInPeriod];
        }
        return db.creditPayments
          .where({ tenantId })
          .filter((cp) => cp.createdAt >= start && cp.createdAt <= end)
          .toArray();
      })(),
    ]);

    // Adjust pending credit by subtracting payments made
    const paidBySale = new Map<string, number>();
    const orphanPaymentIds = new Set<string>();
    for (const cp of creditPaymentsArr) {
      paidBySale.set(cp.saleId, (paidBySale.get(cp.saleId) ?? 0) + cp.amountUsd);
      if (!creditSaleIdsInPeriod.has(cp.saleId)) {
        orphanPaymentIds.add(cp.id);
      }
    }

    pendingCreditUsd = 0;
    collectedCreditUsd = 0;
    customerDebtMap.clear();
    for (const { sale: s } of data) {
      if (!s.isCreditSale) continue;
      const creditUsd = s.exchangeRate > 0 ? s.totalBs / s.exchangeRate : 0;
      const paid = paidBySale.get(s.id) ?? 0;
      const remaining = preciseRound(Math.max(0, creditUsd - paid), 2);
      if (remaining <= 0) {
        collectedCreditUsd += creditUsd;
      } else {
        pendingCreditUsd += remaining;
        if (s.customerId) {
          customerDebtMap.set(s.customerId, (customerDebtMap.get(s.customerId) ?? 0) + remaining);
        }
      }
    }

    // R2: count orphan payments (payments for sales outside the period) as collected
    for (const cp of creditPaymentsArr) {
      if (orphanPaymentIds.has(cp.id)) {
        collectedCreditUsd += cp.amountUsd;
      }
    }

    // Count active cash registers for the period (includes open sessions from previous days)
    const dbForReg = getDb();
    const todayRegisters = await dbForReg.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && (r.isOpen || (r.createdAt >= start && r.createdAt <= end)))
      .toArray();
    const activeRegistersCount = todayRegisters.length;

    const nonSellableExpensesUsd = nsResult.ok ? nsResult.data.totalUsd : 0;
    const nonSellableExpensesBs = nsResult.ok ? nsResult.data.totalBs : 0;
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
    // BACKLOG-106 [REPORTS-001]: Excluir COMPRA_INVENTARIO (el costo ya está en COGS vía purchaseOrder).
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
      pendingCreditUsd: preciseRound(pendingCreditUsd, 2),
      collectedCreditUsd: preciseRound(collectedCreditUsd, 2),
      customersWithDebt: customerDebtMap.size,
      activeRegistersCount,
    });
  } catch (err) {
    console.error('[reportsService.getExecutiveSummary]', err);
    return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar el resumen ejecutivo.'));
  }
}
