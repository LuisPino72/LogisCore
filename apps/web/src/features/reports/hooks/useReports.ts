import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Result, AppError } from '@logiscore/core';
import { EventBus, SystemEvents } from '@logiscore/core';
import { reportsService } from '../services/reportsService';
import type {
  ReportFilters,
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  TopCategoryData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
  ExpenseBreakdownItem,
  ReportTab,
} from '../types';

const REFETCH_DEBOUNCE_MS = 200;

interface ReportsState {
  loading: boolean;
  error: string | null;
  summary: ExecutiveSummaryData | null;
  profitOverTime: DailyProfitPoint[];
  topProducts: TopProductData[];
  topCategories: TopCategoryData[];
  paymentBreakdown: PaymentBreakdownData[];
  cashAnalysis: CashRegisterSummaryData[];
  expenseBreakdown: ExpenseBreakdownItem[];
}

const initialState: ReportsState = {
  loading: false, error: null,
  summary: null, profitOverTime: [], topProducts: [], topCategories: [], paymentBreakdown: [], cashAnalysis: [], expenseBreakdown: [],
};

export function useReports(tenantId: string | null) {
  const [filters, setFilters] = useState<ReportFilters>({ timeRange: 'today' });
  const [state, setState] = useState<ReportsState>(initialState);
  const [activeTab, setActiveTab] = useState<ReportTab>('summary');
  const MAX_CACHE_SIZE = 200;
  const prevKey = useRef('');
  const dataCache = useRef<Map<string, Partial<ReportsState>>>(new Map());
  const cacheOrder = useRef<string[]>([]);
  const debounceRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pruneCache = () => {
    while (cacheOrder.current.length > MAX_CACHE_SIZE) {
      const key = cacheOrder.current.shift()!;
      dataCache.current.delete(key);
    }
  };

  const preloadTabData = useCallback(async (tab: ReportTab) => {
    if (!tenantId) return;
    const cacheKey = `${tenantId}-${tab}-${filters.timeRange}-${filters.startDate ?? ''}-${filters.endDate ?? ''}`;
    if (dataCache.current.has(cacheKey)) return;

    try {
      let updates: Partial<ReportsState>;
      if (tab === 'summary') {
        const [s, p, tp, tc, pm, c, eb] = await Promise.all([
          reportsService.getExecutiveSummary(tenantId, filters),
          reportsService.getProfitOverTime(tenantId, filters),
          reportsService.getTopProducts(tenantId, filters),
          reportsService.getTopCategories(tenantId, filters),
          reportsService.getPaymentBreakdown(tenantId, filters),
          reportsService.getCashAnalysis(tenantId, filters),
          reportsService.getExpenseBreakdown(tenantId, filters),
        ]);
        updates = {
          summary: s.ok ? s.data : null,
          profitOverTime: p.ok ? p.data : [],
          topProducts: tp.ok ? tp.data : [],
          topCategories: tc.ok ? tc.data : [],
          paymentBreakdown: pm.ok ? pm.data : [],
          cashAnalysis: c.ok ? c.data : [],
          expenseBreakdown: eb.ok ? eb.data : [],
        };
      } else if (tab === 'profits') {
        const res = await reportsService.getProfitOverTime(tenantId, filters);
        updates = { profitOverTime: res.ok ? res.data : [] };
      } else if (tab === 'products') {
        const [tp, tc, pm] = await Promise.all([
          reportsService.getTopProducts(tenantId, filters),
          reportsService.getTopCategories(tenantId, filters),
          reportsService.getPaymentBreakdown(tenantId, filters),
        ]);
        updates = {
          topProducts: tp.ok ? tp.data : [],
          topCategories: tc.ok ? tc.data : [],
          paymentBreakdown: pm.ok ? pm.data : [],
        };
      } else {
        const res = await reportsService.getCashAnalysis(tenantId, filters);
        updates = { cashAnalysis: res.ok ? res.data : [] };
      }

      dataCache.current.set(cacheKey, updates);
      cacheOrder.current.push(cacheKey);
      pruneCache();
    } catch {
      // Silent fail for pre-loading
    }
  }, [tenantId, filters]);

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
        const [s, p, tp, tc, pm, c, eb] = await Promise.all([
          reportsService.getExecutiveSummary(tenantId, filters),
          reportsService.getProfitOverTime(tenantId, filters),
          reportsService.getTopProducts(tenantId, filters),
          reportsService.getTopCategories(tenantId, filters),
          reportsService.getPaymentBreakdown(tenantId, filters),
          reportsService.getCashAnalysis(tenantId, filters),
          reportsService.getExpenseBreakdown(tenantId, filters),
        ]);
        const errs = [s, p, tp, tc, pm, c, eb].filter((r) => !r.ok).map((r) => r.error.message);
        apply({
          summary: s.ok ? s.data : null,
          profitOverTime: p.ok ? p.data : [],
          topProducts: tp.ok ? tp.data : [],
          topCategories: tc.ok ? tc.data : [],
          paymentBreakdown: pm.ok ? pm.data : [],
          cashAnalysis: c.ok ? c.data : [],
          expenseBreakdown: eb.ok ? eb.data : [],
        }, errs.length ? errs.join('. ') : null);
        preloadAdjacent(tab);
        return;
      }

      if (tab === 'products') {
        const [tp, tc, pm] = await Promise.all([
          reportsService.getTopProducts(tenantId, filters),
          reportsService.getTopCategories(tenantId, filters),
          reportsService.getPaymentBreakdown(tenantId, filters),
        ]);
        const errs = [tp, tc, pm].filter((r) => !r.ok).map((r) => r.error.message);
        apply({
          topProducts: tp.ok ? tp.data : [],
          topCategories: tc.ok ? tc.data : [],
          paymentBreakdown: pm.ok ? pm.data : [],
        }, errs.length ? errs.join('. ') : null);
        preloadAdjacent(tab);
        return;
      }

      let res: Result<unknown, AppError>;
      if (tab === 'profits') res = await reportsService.getProfitOverTime(tenantId, filters);
      else if (tab === 'cash') res = await reportsService.getCashAnalysis(tenantId, filters);
      else return;

      if (res.ok) {
        const updates: Partial<ReportsState> = {};
        if (tab === 'profits') updates.profitOverTime = res.data as DailyProfitPoint[];
        else if (tab === 'cash') updates.cashAnalysis = res.data as CashRegisterSummaryData[];
        apply(updates, null);
      } else {
        apply({}, res.error.message);
      }
      preloadAdjacent(tab);
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : 'Error al cargar reportes' }));
    }
  }, [tenantId, filters]);

  const preloadAdjacent = useCallback((currentTab: ReportTab) => {
    const tabs: ReportTab[] = ['summary', 'profits', 'products', 'cash'];
    const idx = tabs.indexOf(currentTab);
    if (idx > 0) preloadTabData(tabs[idx - 1]);
    if (idx < tabs.length - 1) preloadTabData(tabs[idx + 1]);
  }, [preloadTabData]);

  useEffect(() => {
    if (!tenantId) return;
    loadTab(activeTab);
  }, [tenantId, filters, activeTab, loadTab]);

  const REPORTS_TABLES = ['sales', 'sale_items', 'cash_registers', 'expenses', 'products', 'categories', 'inventory_movements', 'exchange_rates'];

  const refetch = useCallback((table?: string) => {
    if (debounceRefetchTimer.current) clearTimeout(debounceRefetchTimer.current);
    debounceRefetchTimer.current = setTimeout(() => {
      // Granular invalidation: only clear cache keys affected by the synced table
      if (table && table !== '*') {
        const affectedTabs: ReportTab[] = [];
        if (['sales', 'sale_items', 'exchange_rates'].includes(table)) affectedTabs.push('summary', 'profits', 'cash');
        if (['products', 'categories'].includes(table)) affectedTabs.push('summary', 'products');
        if (['cash_registers'].includes(table)) affectedTabs.push('summary', 'cash');
        if (['expenses'].includes(table)) affectedTabs.push('summary');
        if (['inventory_movements'].includes(table)) affectedTabs.push('summary');
        if (affectedTabs.length > 0) {
          const cacheKey = `${tenantId}-${activeTab}-${filters.timeRange}-${filters.startDate ?? ''}-${filters.endDate ?? ''}`;
          if (affectedTabs.includes(activeTab)) {
            prevKey.current = '';
            dataCache.current.delete(cacheKey);
          }
        }
      } else {
        // Full clear for transaction events or wildcard sync
        prevKey.current = '';
        dataCache.current.clear();
        cacheOrder.current = [];
      }
      loadTab(activeTab);
    }, REFETCH_DEBOUNCE_MS);
  }, [loadTab, activeTab, tenantId, filters]);

  useEffect(() => {
    return () => {
      if (debounceRefetchTimer.current) clearTimeout(debounceRefetchTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const subs = [
      EventBus.on('SALE.COMPLETED', () => refetch()),
      EventBus.on('SALE.VOIDED', () => refetch()),
      EventBus.on(SystemEvents.BOX_CLOSED, () => refetch()),
      EventBus.on('PURCHASE.RECEIVED', () => refetch()),
      EventBus.on('INVENTORY.ADJUSTMENT', () => refetch()),
      EventBus.on('EXPENSES.CREATED', () => refetch()),
      EventBus.on('EXPENSES.UPDATED', () => refetch()),
      EventBus.on('EXPENSES.DELETED', () => refetch()),
      EventBus.on('SYNC.REFRESH_TABLE', (payload: unknown) => {
        const { table } = payload as { table?: string };
        if (!table || table === '*' || REPORTS_TABLES.includes(table)) {
          refetch(table);
        }
      }),
    ];
    return () => {
      subs.forEach((sub) => EventBus.off(sub));
    };
  }, [tenantId, refetch]);

  const topCategories = state.topCategories;

  const worstCategories = useMemo(() =>
    topCategories.length > 5
      ? [...topCategories].reverse().slice(0, 5)
      : [...topCategories].reverse(),
    [topCategories]
  );

  const worstProducts = useMemo(() =>
    state.topProducts.length > 5
      ? [...state.topProducts].sort((a, b) => a.profitBs - b.profitBs).slice(0, 5)
      : [],
    [state.topProducts]
  );

  const topByVolume = useMemo(() =>
    [...state.topProducts]
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5),
    [state.topProducts]
  );

  return {
    filters, setFilters, activeTab, setActiveTab,
    ...state,
    topCategories, worstCategories, worstProducts, topByVolume,
    refetch,
  };
}
