import { useState } from 'react';
import { Card, Button, Select, Spinner } from '@/common/components';
import { Calendar, BarChart3, PieChart, ShoppingBag, Wallet, FileText } from 'lucide-react';
import { useReports } from '../hooks/useReports';
import { ExecutiveSummary } from './ExecutiveSummary';
import { ProfitChart } from './ProfitChart';
import { TopProductsChart } from './TopProductsChart';
import { PaymentBreakdown } from './PaymentBreakdown';
import { CashAnalysis } from './CashAnalysis';
import type { ReportTimeRange, ReportTab } from '../types';

const TIME_RANGE_OPTIONS: { value: ReportTimeRange; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'last7days', label: 'Últimos 7 días' },
  { value: 'thisMonth', label: 'Este mes' },
  { value: 'lastMonth', label: 'Mes pasado' },
];

const TABS: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
  { id: 'summary', label: 'Resumen', icon: <FileText size={16} /> },
  { id: 'profits', label: 'Ganancias', icon: <BarChart3 size={16} /> },
  { id: 'products', label: 'Productos', icon: <ShoppingBag size={16} /> },
  { id: 'payments', label: 'Pagos', icon: <PieChart size={16} /> },
  { id: 'cash', label: 'Caja', icon: <Wallet size={16} /> },
];

interface ReportsPageProps {
  tenantId: string | null;
}

export function ReportsPage({ tenantId }: ReportsPageProps) {
  const {
    filters,
    setFilters,
    activeTab,
    setActiveTab,
    loading,
    error,
    summary,
    profitOverTime,
    topProducts,
    paymentBreakdown,
    cashAnalysis,
    refetch,
  } = useReports(tenantId);

  const [showCustomDate, setShowCustomDate] = useState(false);

  const handleTimeRangeChange = (value: string) => {
    const range = value as ReportTimeRange;
    if (range === 'custom') {
      setShowCustomDate(true);
    } else {
      setShowCustomDate(false);
      setFilters({ timeRange: range });
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500">Análisis de ventas y ganancias</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={filters.timeRange}
            onChange={(e) => handleTimeRangeChange(e.target.value)}
            className="text-sm"
          >
            {TIME_RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" onClick={refetch} disabled={loading}>
            {loading ? <Spinner size="sm" /> : <Calendar size={16} />}
          </Button>
        </div>
      </div>

      {showCustomDate && (
        <Card className="p-3 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 block mb-1">Desde</label>
            <input
              type="date"
              className="input w-full text-sm"
              value={filters.startDate ? filters.startDate.slice(0, 10) : ''}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 block mb-1">Hasta</label>
            <input
              type="date"
              className="input w-full text-sm"
              value={filters.endDate ? filters.endDate.slice(0, 10) : ''}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setFilters((f) => ({ ...f, timeRange: 'custom' }))}
            >
              Aplicar
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <Card className="p-4 bg-danger/5 border-danger/20">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {/* Tabs Desktop */}
      <div className="hidden sm:flex items-center gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4">
        {activeTab === 'summary' && (
          <>
            <ExecutiveSummary data={summary} loading={loading} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PaymentBreakdown data={paymentBreakdown} loading={loading} />
              <TopProductsChart data={topProducts} loading={loading} />
            </div>
          </>
        )}
        {activeTab === 'profits' && <ProfitChart data={profitOverTime} loading={loading} />}
        {activeTab === 'products' && <TopProductsChart data={topProducts} loading={loading} />}
        {activeTab === 'payments' && <PaymentBreakdown data={paymentBreakdown} loading={loading} />}
        {activeTab === 'cash' && <CashAnalysis data={cashAnalysis} loading={loading} />}
      </div>

      {/* Mobile Bottom Nav for Tabs */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex items-center justify-around overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-medium min-w-[60px] ${
                activeTab === tab.id ? 'text-primary' : 'text-gray-500'
              }`}
            >
              {tab.icon}
              <span className="truncate max-w-[60px]">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
