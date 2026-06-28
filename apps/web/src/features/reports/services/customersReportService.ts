import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { ReportsErrors } from '../../../specs/reports/errors';
import { ValidateTenantInputSchema } from '../../../specs/reports/index';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { getPermissionMessage } from '../../auth/permissions/messages';
import type { CustomersSummaryData, CustomerRankingItem, ReportFilters } from '../types';
import { getDateRange } from './reportsHelpers';

export async function getCustomersSummary(tenantId: string, filters: ReportFilters): Promise<Result<CustomersSummaryData, AppError>> {
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

    // Get all customers
    const customers = await db.customers
      .where({ tenantId })
      .filter((c) => !c.deletedAt)
      .toArray();

    // Get sales in period (include partial credit sales)
    const allPeriodSales = await db.sales
      .where({ tenantId })
      .filter((s) => !s.deletedAt && s.createdAt >= start && s.createdAt <= end)
      .toArray();

    // Build paid fraction map for partial credit sales
    const paidFraction = new Map<string, number>();
    const partialCreditSales = allPeriodSales.filter((s) => s.isCreditSale && !s.creditCollected);
    if (partialCreditSales.length > 0) {
      const saleIds = partialCreditSales.map((s) => s.id);
      const payments = await db.creditPayments
        .where({ tenantId })
        .filter((cp) => saleIds.includes(cp.saleId) && !cp.deletedAt)
        .toArray();
      const paidBySale = new Map<string, number>();
      for (const cp of payments) paidBySale.set(cp.saleId, (paidBySale.get(cp.saleId) ?? 0) + cp.amountUsd);
      for (const s of partialCreditSales) {
        const creditTotalUsd = s.exchangeRate > 0 ? s.totalBs / s.exchangeRate : 0;
        const paidUsd = paidBySale.get(s.id) ?? 0;
        paidFraction.set(s.id, creditTotalUsd > 0 ? Math.min(1, paidUsd / creditTotalUsd) : 0);
      }
    }

    const sales = allPeriodSales.filter((s) => {
      if (paidFraction.has(s.id)) return (paidFraction.get(s.id) ?? 0) > 0;
      return true;
    });

    function effectiveTotalBs(sale: typeof allPeriodSales[number]): number {
      const frac = paidFraction.get(sale.id);
      return frac !== undefined ? sale.totalBs * frac : (sale.totalBs || 0);
    }

    // Get customers who bought in period
    const customerIdsInPeriod = new Set(sales.filter((s) => s.customerId).map((s) => s.customerId));
    const activeCustomers = customers.filter((c) => customerIdsInPeriod.has(c.id));

    // New customers (created in period)
    const newCustomers = customers.filter((c) => c.createdAt >= start && c.createdAt <= end);

    // Returning customers (existed before period but bought in period)
    const returningCustomers = activeCustomers.filter((c) => c.createdAt < start);

    // Calculate average ticket (using effectiveTotalBs for partial credits)
    const salesWithCustomer = sales.filter((s) => s.customerId);
    const totalSpentBs = salesWithCustomer.reduce((sum, s) => sum + effectiveTotalBs(s), 0);
    const avgTicketBs = salesWithCustomer.length > 0 ? preciseRound(totalSpentBs / salesWithCustomer.length, 2) : 0;
    const totalUsdFromSales = salesWithCustomer.reduce((sum, s) => {
      const rate = s.exchangeRate && s.exchangeRate > 0 ? s.exchangeRate : 1;
      return sum + (effectiveTotalBs(s) / rate);
    }, 0);
    const avgTicketUsd = salesWithCustomer.length > 0
      ? preciseRound(totalUsdFromSales / salesWithCustomer.length, 2)
      : 0;

    // Retention rate
    const totalWithSales = activeCustomers.length;
    const retentionRate = totalWithSales > 0 ? preciseRound((returningCustomers.length / totalWithSales) * 100, 1) : 0;

    // Top customer
    const customerSpending = new Map<string, { name: string; total: number }>();
    for (const sale of salesWithCustomer) {
      const customer = customers.find((c) => c.id === sale.customerId);
      if (customer) {
        const existing = customerSpending.get(customer.id) || { name: customer.name, total: 0 };
        const rate = sale.exchangeRate && sale.exchangeRate > 0 ? sale.exchangeRate : 1;
        existing.total += effectiveTotalBs(sale) / rate;
        customerSpending.set(customer.id, existing);
      }
    }
    let topCustomer: { name: string; total: number } | undefined;
    for (const [, data] of customerSpending) {
      if (!topCustomer || data.total > topCustomer.total) {
        topCustomer = data;
      }
    }

    return success({
      totalCustomers: customers.length,
      activeCustomers: activeCustomers.length,
      newCustomers: newCustomers.length,
      returningCustomers: returningCustomers.length,
      retentionRate,
      averageTicketUsd: avgTicketUsd,
      averageTicketBs: avgTicketBs,
      topCustomerName: topCustomer?.name,
      topCustomerSpentUsd: topCustomer
        ? preciseRound(topCustomer.total, 2)
        : undefined,
    });
  } catch (err) {
    console.error('[reportsService.getCustomersSummary]', err);
    return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener resumen de clientes.'));
  }
}

export async function getCustomersRanking(tenantId: string, filters: ReportFilters): Promise<Result<CustomerRankingItem[], AppError>> {
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

    const customers = await db.customers
      .where({ tenantId })
      .filter((c) => !c.deletedAt)
      .toArray();

    const allPeriodSales = await db.sales
      .where({ tenantId })
      .filter((s) => !s.deletedAt && s.createdAt >= start && s.createdAt <= end && !!s.customerId)
      .toArray();

    // Build paidFraction map for partial credit sales
    const paidFractionRanking = new Map<string, number>();
    const partialCreditSales = allPeriodSales.filter((s) => s.isCreditSale && !s.creditCollected);
    if (partialCreditSales.length > 0) {
      const saleIds = partialCreditSales.map((s) => s.id);
      const payments = await db.creditPayments
        .where({ tenantId })
        .filter((cp) => saleIds.includes(cp.saleId) && !cp.deletedAt)
        .toArray();
      const paidBySale = new Map<string, number>();
      for (const cp of payments) paidBySale.set(cp.saleId, (paidBySale.get(cp.saleId) ?? 0) + cp.amountUsd);
      for (const s of partialCreditSales) {
        const creditTotalUsd = s.exchangeRate > 0 ? s.totalBs / s.exchangeRate : 0;
        const paidUsd = paidBySale.get(s.id) ?? 0;
        paidFractionRanking.set(s.id, creditTotalUsd > 0 ? Math.min(1, paidUsd / creditTotalUsd) : 0);
      }
    }

    const sales = allPeriodSales.filter((s) => {
      const frac = paidFractionRanking.get(s.id);
      if (frac !== undefined) return frac > 0;
      return true;
    });

    function effectiveTotalBsRanking(sale: typeof allPeriodSales[number]): number {
      const frac = paidFractionRanking.get(sale.id);
      return frac !== undefined ? sale.totalBs * frac : (sale.totalBs || 0);
    }

    // Group sales by customer
    const customerStats = new Map<string, {
      purchaseCount: number;
      totalSpentBs: number;
      totalSpentUsd: number;
      lastPurchaseAt: string | null;
      firstPurchaseAt: string | null;
    }>();

    for (const sale of sales) {
      if (!sale.customerId) continue;
      const existing = customerStats.get(sale.customerId) || {
        purchaseCount: 0,
        totalSpentBs: 0,
        totalSpentUsd: 0,
        lastPurchaseAt: null,
        firstPurchaseAt: null,
      };
      existing.purchaseCount++;
      const rate = sale.exchangeRate && sale.exchangeRate > 0 ? sale.exchangeRate : 1;
      existing.totalSpentBs += effectiveTotalBsRanking(sale);
      existing.totalSpentUsd += effectiveTotalBsRanking(sale) / rate;
      if (!existing.lastPurchaseAt || sale.createdAt > existing.lastPurchaseAt) {
        existing.lastPurchaseAt = sale.createdAt;
      }
      if (!existing.firstPurchaseAt || sale.createdAt < existing.firstPurchaseAt) {
        existing.firstPurchaseAt = sale.createdAt;
      }
      customerStats.set(sale.customerId, existing);
    }

    // Build ranking
    const ranking: CustomerRankingItem[] = [];
    for (const [customerId, stats] of customerStats) {
      const customer = customers.find((c) => c.id === customerId);
      if (!customer) continue;
      ranking.push({
        customerId,
        customerName: customer.name,
        cedula: customer.cedula,
        purchaseCount: stats.purchaseCount,
        totalSpentUsd: preciseRound(stats.totalSpentUsd, 2),
        totalSpentBs: preciseRound(stats.totalSpentBs, 2),
        averageTicketUsd: stats.purchaseCount > 0
          ? preciseRound(stats.totalSpentUsd / stats.purchaseCount, 2)
          : 0,
        lastPurchaseAt: stats.lastPurchaseAt,
        firstPurchaseAt: stats.firstPurchaseAt,
      });
    }

    // Sort by total spent descending
    ranking.sort((a, b) => b.totalSpentUsd - a.totalSpentUsd);

    return success(ranking.slice(0, 50));
  } catch (err) {
    console.error('[reportsService.getCustomersRanking]', err);
    return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener ranking de clientes.'));
  }
}
