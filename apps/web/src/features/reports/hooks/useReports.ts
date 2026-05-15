import { useState, useCallback, useEffect, useRef } from 'react';
import type { Result, AppError } from '@logiscore/core';
import { reportsService } from '../services/reportsService';
import type {
  ReportFilters,
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
  ReportTab,
} from '../types';

interface ReportsState {
  loading: boolean;
  error: string | null;
  summary: ExecutiveSummaryData | null;
  profitOverTime: DailyProfitPoint[];
  topProducts: TopProductData[];
  paymentBreakdown: PaymentBreakdownData[];
  cashAnalysis: CashRegisterSummaryData[];
}

const initialState: ReportsState = {
  loading: false, error: null,
  summary: null, profitOverTime: [], topProducts: [], paymentBreakdown: [], cashAnalysis: [],
};

export function useReports(tenantId: string | null) {
  const [filters, setFilters] = useState<ReportFilters>({ timeRange: 'today' });
  const [state, setState] = useState<ReportsState>(initialState);
  const [activeTab, setActiveTab] = useState<ReportTab>('summary');
  const MAX_CACHE_SIZE = 50;
  const prevKey = useRef('');
  const dataCache = useRef<Map<string, Partial<ReportsState>>>(new Map());
  const cacheOrder = useRef<string[]>([]);

  const pruneCache = () => {
    while (cacheOrder.current.length > MAX_CACHE_SIZE) {
      const key = cacheOrder.current.shift()!;
      dataCache.current.delete(key);
    }
  };

  const loadTab = useCallback(async (tab: ReportTab) => {
    if (!tenantId) return;
    const cacheKey = `${tenantId}-${tab}-${filters.timeRange}-${filters.startDate ?? ''}-${filters.endDate ?? ''}`;
    if (prevKey.current === cacheKey) return;
    prevKey.current = cacheKey;

    const cached = dataCache.current.get(cacheKey);
    if (cached) {
      setState((prev) => ({ ...prev, ...cached, loading: false }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    const apply = (updates: Partial<ReportsState>, error: string | null) => {
      dataCache.current.set(cacheKey, updates);
      cacheOrder.current.push(cacheKey);
      pruneCache();
      setState((prev) => ({ ...prev, ...updates, loading: false, error }));
    };

    try {
      if (tab === 'summary') {
        const [s, p, tp, pm, c] = await Promise.all([
          reportsService.getExecutiveSummary(tenantId, filters),
          reportsService.getProfitOverTime(tenantId, filters),
          reportsService.getTopProducts(tenantId, filters),
          reportsService.getPaymentBreakdown(tenantId, filters),
          reportsService.getCashAnalysis(tenantId, filters),
        ]);
        const errs = [s, p, tp, pm, c].filter((r) => !r.ok).map((r) => r.error.message);
        apply({
          summary: s.ok ? s.data : null,
          profitOverTime: p.ok ? p.data : [],
          topProducts: tp.ok ? tp.data : [],
          paymentBreakdown: pm.ok ? pm.data : [],
          cashAnalysis: c.ok ? c.data : [],
        }, errs.length ? errs.join('. ') : null);
        return;
      }

      let res: Result<unknown, AppError>;
      if (tab === 'profits') res = await reportsService.getProfitOverTime(tenantId, filters);
      else if (tab === 'products') res = await reportsService.getTopProducts(tenantId, filters);
      else if (tab === 'payments') res = await reportsService.getPaymentBreakdown(tenantId, filters);
      else if (tab === 'cash') res = await reportsService.getCashAnalysis(tenantId, filters);
      else return;

      if (res.ok) {
        const updates: Partial<ReportsState> = {};
        if (tab === 'profits') updates.profitOverTime = res.data as DailyProfitPoint[];
        else if (tab === 'products') updates.topProducts = res.data as TopProductData[];
        else if (tab === 'payments') updates.paymentBreakdown = res.data as PaymentBreakdownData[];
        else if (tab === 'cash') updates.cashAnalysis = res.data as CashRegisterSummaryData[];
        apply(updates, null);
      } else {
        apply({}, res.error.message);
      }
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : 'Error al cargar reportes' }));
    }
  }, [tenantId, filters]);

  useEffect(() => {
    if (!tenantId) return;
    loadTab(activeTab);
  }, [tenantId, filters, activeTab, loadTab]);

  const refetch = useCallback(() => {
    prevKey.current = '';
    dataCache.current.clear();
    cacheOrder.current = [];
    loadTab(activeTab);
  }, [loadTab, activeTab]);

  return { filters, setFilters, activeTab, setActiveTab, ...state, refetch };
}
