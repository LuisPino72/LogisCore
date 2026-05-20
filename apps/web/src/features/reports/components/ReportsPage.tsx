import { useState, Suspense, lazy, useRef, useCallback } from 'react';
import { Card, Button, Select, Spinner, BottomNav, DatePicker, ModuleOnboarding, type BottomNavItem, EmptyState, Tooltip } from '@/common/components';
import { BarChart3, PieChart, ShoppingBag, Wallet, FileText, TrendingUp, ShieldBan } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { useAuthStore } from '../../auth/stores/authStore';
import { useReports } from '../hooks/useReports';
import { useToastStore } from '../../../stores/toastStore';
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
  { id: 'cash', label: 'Caja', icon: <Wallet size={20} /> },
];

interface ReportsPageProps {
  tenantId: string | null;
}

export function ReportsPage({ tenantId }: ReportsPageProps) {
  const role = useAuthStore((s) => s.session?.role);
  const { addToast } = useToastStore();
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

  const printRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handlePrint = useCallback(async () => {
    if (!printRef.current) return;
    
    setIsGeneratingPdf(true);
    
    const container = printRef.current.parentElement;
    if (!container) {
      setIsGeneratingPdf(false);
      return;
    }

    const originalStyles = {
      position: container.style.position,
      top: container.style.top,
      left: container.style.left,
      opacity: container.style.opacity,
      zIndex: container.style.zIndex,
      pointerEvents: container.style.pointerEvents,
    };

    try {
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.opacity = '1';
      container.style.zIndex = '9999';
      container.style.pointerEvents = 'none';

      await new Promise(resolve => setTimeout(resolve, 300));

      const element = printRef.current;
      const fileName = `LogisCore-Reporte-${new Date().toISOString().slice(0, 10)}.pdf`;
      
      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: fileName,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          logging: false,
          letterRendering: true,
          backgroundColor: '#ffffff',
        },
        jsPDF: { 
          unit: 'mm' as const, 
          format: 'a4' as const, 
          orientation: 'portrait' as const,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      await html2pdf().set(opt).from(element).save();
      addToast({ type: 'success', message: 'PDF generado exitosamente', duration: 3000 });
    } catch (error) {
      console.error('Error generando PDF:', error);
      addToast({ type: 'error', message: 'Error al generar el PDF. Intenta nuevamente.', duration: 5000 });
    } finally {
      container.style.position = originalStyles.position;
      container.style.top = originalStyles.top;
      container.style.left = originalStyles.left;
      container.style.opacity = originalStyles.opacity;
      container.style.zIndex = originalStyles.zIndex;
      container.style.pointerEvents = originalStyles.pointerEvents;
      setIsGeneratingPdf(false);
    }
  }, [addToast]);

  return (
    <div
      className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6 sm:pb-6 max-sm:pb-[calc(3.5rem+env(safe-area-inset-bottom,0))]"
    >
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
          <Tooltip content="Exportar o imprimir reportes" position="left">
            <ExportButton
              summary={summary}
              profitOverTime={profitOverTime}
              topProducts={topProducts}
              paymentBreakdown={paymentBreakdown}
              cashAnalysis={cashAnalysis}
              loading={loading}
              onPrint={handlePrint}
              isGeneratingPdf={isGeneratingPdf}
            />
          </Tooltip>
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
          <Tooltip key={tab.id} content={`Ver ${tab.label.toLowerCase()}`} position="bottom">
            <button
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
          </Tooltip>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4 sm:space-y-6">
        <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
          {activeTab === 'summary' && (
            <div className="print-section">
              <ExecutiveSummary data={summary} loading={loading} />
            </div>
          )}
          {activeTab === 'profits' && <div className="print-section"><ProfitChart data={profitOverTime} loading={loading} /></div>}
          {activeTab === 'products' && (
            <div className="print-section space-y-4 sm:space-y-6">
              <TopProductsChart data={topProducts} loading={loading} />
              <PaymentBreakdown data={paymentBreakdown} loading={loading} />
            </div>
          )}
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

      <div className="print-container">
        <PrintView
          ref={printRef}
          summary={summary}
          profitOverTime={profitOverTime}
          topProducts={topProducts}
          paymentBreakdown={paymentBreakdown}
          cashAnalysis={cashAnalysis}
        />
      </div>
    </div>
  );
}
