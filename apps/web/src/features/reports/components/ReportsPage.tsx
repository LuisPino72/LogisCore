import { useState, Suspense, lazy, useEffect, useCallback } from 'react';
import { Card, Button, Select, Spinner, BottomNav, DatePicker, ModuleOnboarding, type BottomNavItem, EmptyState } from '@/common/components';
import { BarChart3, PieChart, ShoppingBag, Wallet, FileText, TrendingUp, ShieldBan } from 'lucide-react';
import { useAuthStore } from '../../auth/stores/authStore';
import { useReports } from '../hooks/useReports';
import { ExportButton } from './ExportButton';
import { ExecutiveSummary } from './ExecutiveSummary';
import { PrintView } from './PrintView';
import type { ReportTimeRange, ReportTab } from '../types';
import '../print.css';

const ProfitChart = lazy(() => import('./ProfitChart').then((m) => ({ default: m.ProfitChart })));
const TopProductsChart = lazy(() => import('./TopProductsChart').then((m) => ({ default: m.TopProductsChart })));
const PaymentBreakdown = lazy(() => import('./PaymentBreakdown').then((m) => ({ default: m.PaymentBreakdown })));
const CashAnalysis = lazy(() => import('./CashAnalysis').then((m) => ({ default: m.CashAnalysis })));

const TIME_RANGE_OPTIONS: { value: ReportTimeRange; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'last7days', label: 'Últimos 7 días' },
  { value: 'thisMonth', label: 'Este mes' },
  { value: 'lastMonth', label: 'Mes pasado' },
  { value: 'custom', label: 'Personalizado' },
];

const TABS: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
  { id: 'summary', label: 'Resumen', icon: <FileText size={20} /> },
  { id: 'profits', label: 'Ganancias', icon: <BarChart3 size={20} /> },
  { id: 'products', label: 'Productos', icon: <ShoppingBag size={20} /> },
  { id: 'payments', label: 'Pagos', icon: <PieChart size={20} /> },
  { id: 'cash', label: 'Caja', icon: <Wallet size={20} /> },
];

interface ReportsPageProps {
  tenantId: string | null;
}

export function ReportsPage({ tenantId }: ReportsPageProps) {
  const role = useAuthStore((s) => s.session?.role);
  const isOwner = role === 'owner' || role === 'admin';

  if (!isOwner) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <Card>
          <EmptyState
            icon={<ShieldBan size={48} />}
            title="Acceso restringido"
            description="Solo el propietario del local puede acceder a los reportes."
          />
        </Card>
      </div>
    );
  }

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

  const bottomNavItems: BottomNavItem[] = TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon,
    onClick: () => setActiveTab(tab.id),
  }));

  const [printing, setPrinting] = useState(false);

  const handlePrint = useCallback(() => {
    setPrinting(true);
  }, []);

  useEffect(() => {
    if (!printing) return;
    const id = requestAnimationFrame(() => {
      window.print();
    });
    return () => cancelAnimationFrame(id);
  }, [printing]);

  useEffect(() => {
    const handler = () => setPrinting(false);
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-20 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <BarChart3 size={22} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-title font-bold" style={{ fontSize: 'var(--text-fluid-xl)' }}>Reportes</h1>
            <p className="text-xs text-text-secondary">Análisis de ventas y ganancias</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide hidden sm:block">Periodo</label>
            <Select
              value={filters.timeRange}
              onChange={(e) => handleTimeRangeChange(e.target.value)}
            >
              {TIME_RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <ExportButton
            summary={summary}
            profitOverTime={profitOverTime}
            topProducts={topProducts}
            paymentBreakdown={paymentBreakdown}
            cashAnalysis={cashAnalysis}
            loading={loading}
            onPrint={handlePrint}
          />
        </div>
      </div>

      {showCustomDate && (
        <Card className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <DatePicker
              label="Desde"
              value={filters.startDate ? filters.startDate.slice(0, 10) : ''}
              onChange={(e) => {
                const v = e.target.value;
                setFilters((f) => ({ ...f, startDate: v ? `${v}T00:00:00` : undefined }))
              }}
            />
          </div>
          <div className="flex-1">
            <DatePicker
              label="Hasta"
              value={filters.endDate ? filters.endDate.slice(0, 10) : ''}
              onChange={(e) => {
                const v = e.target.value;
                setFilters((f) => ({ ...f, endDate: v ? `${v}T23:59:59` : undefined }))
              }}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setFilters((f) => ({ ...f, timeRange: 'custom' }))}
            >
              Aplicar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCustomDate(false)}
            >
              Cerrar
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
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4 sm:space-y-6">
        <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
          {activeTab === 'summary' && (
            <div className="print-section">
              <ExecutiveSummary data={summary} loading={loading} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PaymentBreakdown data={paymentBreakdown} loading={loading} />
                <TopProductsChart data={topProducts} loading={loading} />
              </div>
            </div>
          )}
          {activeTab === 'profits' && <div className="print-section"><ProfitChart data={profitOverTime} loading={loading} /></div>}
          {activeTab === 'products' && <div className="print-section"><TopProductsChart data={topProducts} loading={loading} /></div>}
          {activeTab === 'payments' && <div className="print-section"><PaymentBreakdown data={paymentBreakdown} loading={loading} /></div>}
          {activeTab === 'cash' && <div className="print-section"><CashAnalysis data={cashAnalysis} loading={loading} /></div>}
        </Suspense>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeId={activeTab}
        items={bottomNavItems}
      />

      <ModuleOnboarding
        moduleId="reports"
        steps={[
          {
            title: 'Analiza tu Negocio',
            description: 'Aquí ves cuánto vendiste, cuánto ganaste y qué productos se venden más. Selecciona un periodo para ver los datos.',
            icon: <FileText size={24} className="text-white" />,
          },
          {
            title: 'Ganancias',
            description: 'Mira cómo han sido tus ventas en el tiempo. La ganancia es la diferencia entre lo que cobraste y lo que te costó el producto.',
            icon: <TrendingUp size={24} className="text-white" />,
          },
          {
            title: 'Formas de Pago',
            description: 'Ve cuánto has recibido en efectivo, transferencia u otros métodos. Útil para cuadrar tu caja al final del día.',
            icon: <PieChart size={24} className="text-white" />,
          },
        ]}
        onComplete={() => {}}
      />

      {printing && (
        <PrintView
          summary={summary}
          profitOverTime={profitOverTime}
          topProducts={topProducts}
          paymentBreakdown={paymentBreakdown}
          cashAnalysis={cashAnalysis}
        />
      )}
    </div>
  );
}
