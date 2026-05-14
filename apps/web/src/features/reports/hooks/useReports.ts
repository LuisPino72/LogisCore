import { useState, useCallback, useEffect, useRef } from 'react';
import { reportsService } from '../services/reportsService';
import type {
  ReportFilters,
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
  CategoryProfitData,
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
  categoryProfit: CategoryProfitData[];
}

const initialState: ReportsState = {
  loading: false,
  error: null,
  summary: null,
  profitOverTime: [],
  topProducts: [],
  paymentBreakdown: [],
  cashAnalysis: [],
  categoryProfit: [],
};

export function useReports(tenantId: string | null) {
  const [filters, setFilters] = useState<ReportFilters>({ timeRange: 'today' });
  const [state, setState] = useState<ReportsState>(initialState);
  const [activeTab, setActiveTab] = useState<ReportTab>('summary');
  const prevKey = useRef<string>('');

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    const cacheKey = `${tenantId}-${filters.timeRange}-${filters.startDate ?? ''}-${filters.endDate ?? ''}`;
    if (prevKey.current === cacheKey) return;
    prevKey.current = cacheKey;

    setState((s) => ({ ...s, loading: true, error: null }));

    const [summaryRes, profitRes, topRes, paymentRes, cashRes, catRes] = await Promise.all([
      reportsService.getExecutiveSummary(tenantId, filters),
      reportsService.getProfitOverTime(tenantId, filters),
      reportsService.getTopProducts(tenantId, filters),
      reportsService.getPaymentBreakdown(tenantId, filters),
      reportsService.getCashAnalysis(tenantId, filters),
      reportsService.getCategoryProfit(tenantId, filters),
    ]);

    const errors: string[] = [];
    if (!summaryRes.ok) errors.push(summaryRes.error.message);
    if (!profitRes.ok) errors.push(profitRes.error.message);
    if (!topRes.ok) errors.push(topRes.error.message);
    if (!paymentRes.ok) errors.push(paymentRes.error.message);
    if (!cashRes.ok) errors.push(cashRes.error.message);
    if (!catRes.ok) errors.push(catRes.error.message);

    setState({
      loading: false,
      error: errors.length > 0 ? errors.join('. ') : null,
      summary: summaryRes.ok ? summaryRes.data : null,
      profitOverTime: profitRes.ok ? profitRes.data : [],
      topProducts: topRes.ok ? topRes.data : [],
      paymentBreakdown: paymentRes.ok ? paymentRes.data : [],
      cashAnalysis: cashRes.ok ? cashRes.data : [],
      categoryProfit: catRes.ok ? catRes.data : [],
    });
  }, [tenantId, filters]);

  useEffect(() => {
    if (!tenantId) return;
    loadAll();
  }, [tenantId, filters, loadAll]);

  const refetch = useCallback(() => {
    prevKey.current = '';
    loadAll();
  }, [loadAll]);

  return {
    filters,
    setFilters,
    activeTab,
    setActiveTab,
    ...state,
    refetch,
  };
}
