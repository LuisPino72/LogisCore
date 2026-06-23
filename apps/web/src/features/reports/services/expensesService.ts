import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { ReportsErrors } from '../../../specs/reports/errors';
import { ValidateTenantInputSchema, ReportsFiltersSchema } from '../../../specs/reports/index';
import { logger } from '../../../lib/logger';
import type { AdjustmentLossExpenses, ExpenseBreakdownItem, ReportFilters } from '../types';
import { getDateRange, fetchSalesWithItems, effectiveItemQuantity, calcItemCostBs, getRateForDateCached } from './reportsHelpers';

export async function getNonSellableExpenses(tenantId: string, start: string, end: string): Promise<Result<{ totalUsd: number; totalBs: number }, AppError>> {
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
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
}

export async function getAdjustmentLossExpenses(tenantId: string, start: string, end: string): Promise<Result<AdjustmentLossExpenses, AppError>> {
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
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
}

export async function getExpenseBreakdown(tenantId: string, filters: ReportFilters): Promise<Result<ExpenseBreakdownItem[], AppError>> {
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

    const nsResult = await getNonSellableExpenses(tenantId, start, end);
    if (nsResult.ok && nsResult.data.totalUsd > 0) {
      items.push({
        type: 'no_vendibles',
        label: 'Gastos No Vendibles',
        amountBs: nsResult.data.totalBs,
        amountUsd: nsResult.data.totalUsd,
      });
    }

    const adjResult = await getAdjustmentLossExpenses(tenantId, start, end);
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

    // MED-9: Compras de inventario — sección separada (audit trail, no operativo)
    const db = getDb();
    const startNorm = start.slice(0, 10);
    const endNorm = end.slice(0, 10);
    const comprasInventario = await db.expenses
      .where('[tenantId+date]')
      .between([tenantId, startNorm], [tenantId, endNorm])
      .filter((e) => !e.deletedAt && !e.isRecurring && e.status === 'paid' && e.category === 'COMPRA_INVENTARIO')
      .toArray();

    if (comprasInventario.length > 0) {
      let totalUsd = 0;
      let totalBs = 0;
      for (const exp of comprasInventario) {
        totalUsd += exp.amountUsd;
        totalBs += exp.amountBs;
      }
      items.push({
        type: 'compra_inventario',
        label: 'Compras de Inventario',
        amountBs: preciseRound(totalBs, 2),
        amountUsd: preciseRound(totalUsd, 2),
      });
    }

    // Operating expenses breakdown
    // BACKLOG-106 [REPORTS-001]: Excluir COMPRA_INVENTARIO del desglose operativo (el costo ya se refleja en COGS + sección separada).
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
}
