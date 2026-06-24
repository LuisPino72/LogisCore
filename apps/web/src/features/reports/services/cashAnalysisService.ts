import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { ReportsErrors } from '../../../specs/reports/errors';
import { ValidateTenantInputSchema, ReportsFiltersSchema } from '../../../specs/reports/index';
import type { PaymentMethod } from '../../../specs/pos';
import { startOfDayFromDateStringVzla, endOfDayFromDateStringVzla } from '../../../lib/date';
import type { CashRegisterSummaryData, RegisterCashAnalysis, GlobalCashAnalysis, ReportFilters } from '../types';
import { getDateRange } from './reportsHelpers';

export async function getCashAnalysis(tenantId: string, filters: ReportFilters): Promise<Result<CashRegisterSummaryData[], AppError>> {
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
            collectedDebtBs: Number(r.collected_debt_bs) || 0, // FUGA-1
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

    // Resolve register names from registerConfigs
    const regIds = registers.map((r) => r.registerId).filter(Boolean) as string[];
    const regConfigs = regIds.length > 0
      ? await db.registerConfigs.where('id').anyOf(regIds).toArray()
      : [];
    const regNameMap = new Map(regConfigs.map((c) => [c.id, c.name]));

    // Resolve operator names from Supabase user_roles
    const userIds = registers.map((r) => r.openedBy).filter(Boolean) as string[];
    const userNameMap = new Map<string, string>();
    if (userIds.length > 0) {
      try {
        const tokenResult = await supabase.auth.getSession();
        if (tokenResult.data.session?.access_token) {
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-users`,
            { headers: { 'Authorization': `Bearer ${tokenResult.data.session.access_token}` } },
          );
          if (resp.ok) {
            const allUsers = await resp.json();
            for (const u of allUsers) {
              if (userIds.includes(u.userId)) {
                userNameMap.set(u.userId, u.name || u.email || u.userId);
              }
            }
          }
        }
        // Fallback: map remaining userIds from user_roles table
        if (userIds.some((uid) => !userNameMap.has(uid))) {
          const { data: userRoles } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('tenant_id', tenantUuid)
            .is('deleted_at', null);
          if (userRoles) {
            for (const ur of userRoles) {
              if (!userNameMap.has(ur.user_id)) {
                userNameMap.set(ur.user_id, ur.user_id);
              }
            }
          }
        }
      } catch {
        // fallback: use userId as name
      }
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
         ? preciseRound(openingBalanceUsd + totalSalesUsd + (r.collectedDebtBs ?? 0) / closeRate, 2)
        : undefined;

      const differenceUsd = (r.differenceBs != null && closeRate > 0)
        ? preciseRound(r.differenceBs / closeRate, 2)
        : undefined;

      return {
        registerId: r.id,
        registerName: r.registerId ? (regNameMap.get(r.registerId) ?? 'Caja') : 'Caja Principal',
        operatorName: r.openedBy ? (userNameMap.get(r.openedBy) ?? 'Usuario') : '—',
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
        collectedDebtBs: r.collectedDebtBs ?? 0,
        status: r.isOpen ? 'open' : 'closed',
      };
    });

    return success(result);
  } catch (err) {
    console.error('[reportsService.getCashAnalysis]', err);
    return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar analisis de caja.'));
  }
}

export async function getCashAnalysisByRegister(tenantId: string, date: string): Promise<Result<RegisterCashAnalysis[], AppError>> {
  const tenantCheck = ValidateTenantInputSchema.safeParse(tenantId);
  if (!tenantCheck.success) {
    return failure(new AppError(ReportsErrors.REPORT_INVALID_TENANT_ID, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
  }
  try {
    const db = getDb();
    const start = startOfDayFromDateStringVzla(date);
    const end = endOfDayFromDateStringVzla(date);

    const registers = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.createdAt >= start && r.createdAt <= end)
      .toArray();

    // Resolve register names from registerConfigs
    const registerIds = registers.map((r) => r.registerId).filter(Boolean) as string[];
    const configs = registerIds.length > 0
      ? await db.registerConfigs.where('id').anyOf(registerIds).toArray()
      : [];
    const configMap = new Map(configs.map((c) => [c.id, c.name]));

    // Resolve operator names from Supabase user_roles
    const userIds = registers.map((r) => r.openedBy).filter(Boolean) as string[];
    const userMap = new Map<string, string>();
    if (userIds.length > 0) {
      try {
        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('tenant_id', tenantUuid)
          .is('deleted_at', null);
        if (userRoles) {
          for (const ur of userRoles) {
            userMap.set(ur.user_id, ur.user_id);
          }
        }
        // Try to get display names via edge function
        const tokenResult = await supabase.auth.getSession();
        if (tokenResult.data.session?.access_token) {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-users`,
            { headers: { 'Authorization': `Bearer ${tokenResult.data.session.access_token}` } },
          );
          if (response.ok) {
            const allUsers = await response.json();
            for (const u of allUsers) {
              if (userIds.includes(u.userId)) {
                userMap.set(u.userId, u.name || u.email || u.userId);
              }
            }
          }
        }
      } catch {
        // fallback: use userId as name
      }
    }

    const result: RegisterCashAnalysis[] = registers.map((r) => {
      const openingBal = r.openingBalanceBs ?? 0;
      const salesBs = r.totalSalesBs;
      const debtBs = r.collectedDebtBs ?? 0;
      const expectedBs = r.expectedClosingBs ?? (openingBal + salesBs + debtBs);
      const diffBs = r.differenceBs ?? null;
      const closeRate = r.closingRate && r.closingRate > 0 ? r.closingRate : (r.openingRate && r.openingRate > 0 ? r.openingRate : 0);

      return {
        registerId: r.id,
        registerName: r.registerId ? (configMap.get(r.registerId) ?? 'Caja') : 'Caja Principal',
        operatorName: r.openedBy ? (userMap.get(r.openedBy) ?? 'Usuario') : '—',
        openingBalanceBs: openingBal,
        totalSalesBs: salesBs,
        totalSalesCount: r.totalSalesCount,
        collectedDebtBs: debtBs,
        expectedClosingBs: expectedBs,
        differenceBs: diffBs,
        differenceUsd: diffBs !== null && closeRate > 0 ? preciseRound(diffBs / closeRate, 2) : null,
        status: r.isOpen ? 'open' : 'closed',
      };
    });

    return success(result);
  } catch (err) {
    console.error('[reportsService.getCashAnalysisByRegister]', err);
    return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al generar análisis por caja.'));
  }
}

export async function getCashAnalysisGlobal(tenantId: string, date: string): Promise<Result<GlobalCashAnalysis, AppError>> {
  const registersResult = await getCashAnalysisByRegister(tenantId, date);
  if (!registersResult.ok) {
    return failure(registersResult.error);
  }
  const registers = registersResult.data;

  const global: GlobalCashAnalysis = {
    totalRegisters: registers.length,
    totalOpeningBalanceBs: preciseRound(registers.reduce((s, r) => s + r.openingBalanceBs, 0), 2),
    totalSalesBs: preciseRound(registers.reduce((s, r) => s + r.totalSalesBs, 0), 2),
    totalSalesCount: registers.reduce((s, r) => s + r.totalSalesCount, 0),
    totalCollectedDebtBs: preciseRound(registers.reduce((s, r) => s + r.collectedDebtBs, 0), 2),
    totalExpectedClosingBs: preciseRound(registers.reduce((s, r) => s + (r.expectedClosingBs ?? 0), 0), 2),
    totalDifferenceBs: preciseRound(registers.reduce((s, r) => s + (r.differenceBs ?? 0), 0), 2),
  };

  return success(global);
}
