import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { getDb, type DexieSale } from '../../../services/dexie/db';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { ReportsErrors } from '../../../specs/reports/errors';
import { ReportsFiltersSchema, ValidateTenantInputSchema, TopProductsLimitSchema } from '../../../specs/reports/index';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { getPermissionMessage } from '../../auth/permissions/messages';
import type { ReportFilters, DailyProfitPoint, TopProductData, TopCategoryData, PaymentBreakdownData, SaleDetail, DiscountBreakdownItem, TicketDistributionItem } from '../types';
import { getDateRange, fetchSalesWithItems, effectiveItemQuantity, calcItemCostBs, PAYMENT_LABELS } from './reportsHelpers';

export async function getProfitOverTime(tenantId: string, filters: ReportFilters): Promise<Result<DailyProfitPoint[], AppError>> {
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
}

export async function getTopProducts(tenantId: string, filters: ReportFilters, limit = 10): Promise<Result<TopProductData[], AppError>> {
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
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
}

export async function getTopCategories(tenantId: string, filters: ReportFilters): Promise<Result<TopCategoryData[], AppError>> {
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
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
      productCategoryMap.set(p.id, p.categoryId ?? undefined);
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
}

export async function getPaymentBreakdown(tenantId: string, filters: ReportFilters): Promise<Result<PaymentBreakdownData[], AppError>> {
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
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
}

export async function getSalesDetail(tenantId: string, filters: ReportFilters): Promise<Result<SaleDetail[], AppError>> {
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

    const sales: SaleDetail[] = data.map(({ sale, items }) => {
      const dateObj = new Date(sale.createdAt);
      const ivaBs = sale.ivaBs || 0;
      const ivaUsd = sale.exchangeRate > 0 ? preciseRound(ivaBs / sale.exchangeRate, 2) : 0;
      // DINERO-014 (M4): subtotal = total - IVA
      const subtotalBs = preciseRound(sale.totalBs - ivaBs, 2);
      const subtotalUsd = sale.exchangeRate > 0 ? preciseRound(subtotalBs / sale.exchangeRate, 2) : 0;
      return {
        id: sale.id,
        createdAt: sale.createdAt,
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

    sales.sort((a, b) => b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0);
    return success(sales);
  } catch (err) {
    console.error('[reportsService.getSalesDetail]', err);
    return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener detalle de ventas.'));
  }
}

export async function getTicketDistribution(tenantId: string, filters: ReportFilters): Promise<Result<TicketDistributionItem[], AppError>> {
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
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
}

export async function getDiscountBreakdown(tenantId: string, filters: ReportFilters): Promise<Result<DiscountBreakdownItem[], AppError>> {
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
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
        subtotalPreDiscountBs: preciseRound(d.sale.totalBs + (d.sale.discountBs || 0), 2),
        totalBs: d.sale.totalBs,
        paymentMethod: d.sale.paymentMethod,
      }))
      .sort((a, b) => b.discountBs - a.discountBs);

    return success(discounted);
  } catch (err) {
    console.error('[reportsService.getDiscountBreakdown]', err);
    return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener desglose de descuentos.'));
  }
}
