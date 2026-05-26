import { useState, Suspense, lazy, useRef, useCallback } from 'react';
import { Card, Button, Select, Spinner, BottomNav, DatePicker, ModuleOnboarding, type BottomNavItem, EmptyState, Tooltip, DrillDownModal } from '@/common/components';
import type { Column } from '@/common/components';
import { BarChart3, PieChart, ShoppingBag, Wallet, FileText, TrendingUp, ShieldBan, Printer } from 'lucide-react';
import { useAuthStore } from '../../auth/stores/authStore';
import { useReports } from '../hooks/useReports';
import { useToastStore } from '../../../stores/toastStore';
import { ExportButton } from './ExportButton';
import { ExecutiveSummary } from './ExecutiveSummary';
import { InsightsCarousel } from './InsightsCarousel';
import { PrintView } from './PrintView';
import { reportsService } from '../services/reportsService';
import type { ReportTimeRange, ReportTab, DrillDownType } from '../types';
import { formatBs, formatUsd } from '@/lib/formatBs';
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
    topCategories,
    worstCategories,
    worstProducts,
    topByVolume,
    paymentBreakdown,
    cashAnalysis,
  } = useReports(tenantId);

  const [showCustomDate, setShowCustomDate] = useState(false);

  const [activeDrillDown, setActiveDrillDown] = useState<DrillDownType | null>(null);
  const [drillDownData, setDrillDownData] = useState<Record<string, unknown>[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  const PAYMENT_LABELS: Record<string, string> = {
    efectivo_bs: 'Efectivo Bs',
    pago_movil: 'Pago Móvil',
    tarjeta_bs: 'Tarjeta Bs',
    efectivo_usd: 'Efectivo USD',
  };

  const drillDownConfigs: Record<DrillDownType, {
    title: string;
    columns: Column<Record<string, unknown>>[];
    footerSummary?: (data: Record<string, unknown>[]) => { label: string; value: string }[];
  }> = {
    ventas: {
      title: 'Ventas Totales',
      columns: [
        { key: 'date', header: 'Fecha' },
        { key: 'time', header: 'Hora', hideOnMobile: true },
        { key: 'itemCount', header: 'Items', className: 'text-center' },
        { key: 'totalBs', header: 'Total Bs', render: (item) => formatBs(item.totalBs as number) },
        { key: 'totalUsd', header: 'Total USD', render: (item) => formatUsd(item.totalUsd as number) },
        { key: 'paymentMethod', header: 'Pago', render: (item) => PAYMENT_LABELS[item.paymentMethod as string] ?? item.paymentMethod as string, hideOnMobile: true },
      ],
      footerSummary: (data) => {
        const totalBs = data.reduce((s, d) => s + (d.totalBs as number), 0);
        const totalUsd = data.reduce((s, d) => s + (d.totalUsd as number), 0);
        return [
          { label: 'Total Bs', value: formatBs(totalBs) },
          { label: 'Total USD', value: formatUsd(totalUsd) },
          { label: 'Transacciones', value: String(data.length) },
        ];
      },
    },
    ganancia: {
      title: 'Ganancia Bruta por Producto',
      columns: [
        { key: 'name', header: 'Producto', render: (item) => <span className="wrap-break-word">{item.name as string}</span> },
        { key: 'quantitySold', header: 'Cant', className: 'text-center' },
        { key: 'revenueBs', header: 'Ingreso Bs', render: (item) => formatBs(item.revenueBs as number), hideOnMobile: true },
        { key: 'revenueUsd', header: 'Ingreso $', render: (item) => formatUsd(item.revenueUsd as number), hideOnMobile: true },
        { key: 'costBs', header: 'Costo Bs', render: (item) => formatBs(item.costBs as number), hideOnMobile: true },
        { key: 'costUsd', header: 'Costo $', render: (item) => formatUsd(item.costUsd as number), hideOnMobile: true },
        { key: 'profitBs', header: 'Ganancia Bs', render: (item) => formatBs(item.profitBs as number) },
        { key: 'profitUsd', header: 'Ganancia $', render: (item) => formatUsd(item.profitUsd as number) },
        { key: 'marginPercent', header: 'Margen', render: (item) => `${item.marginPercent}%`, className: 'text-right' },
      ],
      footerSummary: (data) => {
        const totalRevenue = data.reduce((s, d) => s + (d.revenueBs as number), 0);
        const totalRevenueUsd = data.reduce((s, d) => s + (d.revenueUsd as number), 0);
        const totalCost = data.reduce((s, d) => s + (d.costBs as number), 0);
        const totalCostUsd = data.reduce((s, d) => s + (d.costUsd as number), 0);
        const totalProfit = data.reduce((s, d) => s + (d.profitBs as number), 0);
        const totalProfitUsd = data.reduce((s, d) => s + (d.profitUsd as number), 0);
        return [
          { label: 'Ingreso', value: `${formatBs(totalRevenue)} / ${formatUsd(totalRevenueUsd)}` },
          { label: 'Costo', value: `${formatBs(totalCost)} / ${formatUsd(totalCostUsd)}` },
          { label: 'Ganancia', value: `${formatBs(totalProfit)} / ${formatUsd(totalProfitUsd)}` },
        ];
      },
    },
    gastos: {
      title: 'Gasto Total',
      columns: [
        { key: 'label', header: 'Tipo de Gasto' },
        { key: 'amountBs', header: 'Monto Bs', render: (item) => formatBs(item.amountBs as number) },
        { key: 'amountUsd', header: 'Monto USD', render: (item) => formatUsd(item.amountUsd as number) },
      ],
      footerSummary: (data) => {
        const totalBs = data.reduce((s, d) => s + (d.amountBs as number), 0);
        const totalUsd = data.reduce((s, d) => s + (d.amountUsd as number), 0);
        return [
          { label: 'Total Bs', value: formatBs(totalBs) },
          { label: 'Total USD', value: formatUsd(totalUsd) },
        ];
      },
    },
    ticket: {
      title: 'Distribución de Tickets',
      columns: [
        { key: 'range', header: 'Rango' },
        { key: 'count', header: 'Ventas', className: 'text-center' },
        { key: 'percentage', header: '%', render: (item) => `${item.percentage}%`, className: 'text-center' },
        { key: 'cumulative', header: 'Acumulado', render: (item) => `${item.cumulative}%`, hideOnMobile: true },
      ],
    },
    topProducto: {
      title: 'Productos más Rentables',
      columns: [
        { key: 'name', header: 'Producto', render: (item) => <span className="wrap-break-word">{item.name as string}</span> },
        { key: 'quantitySold', header: 'Cant', className: 'text-center' },
        { key: 'revenueBs', header: 'Ingreso Bs', render: (item) => formatBs(item.revenueBs as number), hideOnMobile: true },
        { key: 'costBs', header: 'Costo Bs', render: (item) => formatBs(item.costBs as number), hideOnMobile: true },
        { key: 'profitBs', header: 'Ganancia Bs', render: (item) => formatBs(item.profitBs as number) },
        { key: 'marginPercent', header: 'Margen', render: (item) => `${item.marginPercent}%`, className: 'text-right' },
      ],
      footerSummary: (data) => {
        const totalRevenue = data.reduce((s, d) => s + (d.revenueBs as number), 0);
        const totalCost = data.reduce((s, d) => s + (d.costBs as number), 0);
        const totalProfit = data.reduce((s, d) => s + (d.profitBs as number), 0);
        return [
          { label: 'Ingreso', value: formatBs(totalRevenue) },
          { label: 'Costo', value: formatBs(totalCost) },
          { label: 'Ganancia', value: formatBs(totalProfit) },
        ];
      },
    },
  };

  const handleKpiClick = useCallback(async (type: DrillDownType) => {
    if (!tenantId) return;
    setActiveDrillDown(type);
    setDrillDownLoading(true);

    try {
      let result;
      if (type === 'ventas') {
        result = await reportsService.getSalesDetail(tenantId, filters);
      } else if (type === 'ganancia' || type === 'topProducto') {
        result = await reportsService.getTopProducts(tenantId, filters, 50);
      } else if (type === 'gastos') {
        result = await reportsService.getExpenseBreakdown(tenantId, filters);
      } else if (type === 'ticket') {
        result = await reportsService.getTicketDistribution(tenantId, filters);
      }

      if (result?.ok) {
        setDrillDownData(result.data as unknown as Record<string, unknown>[]);
      } else {
        setDrillDownData([]);
      }
    } catch {
      setDrillDownData([]);
    } finally {
      setDrillDownLoading(false);
    }
  }, [tenantId, filters]);

  const getSubtitle = (): string => {
    const rangeLabels: Record<string, string> = {
      today: 'Hoy',
      yesterday: 'Ayer',
      last7days: 'Últimos 7 días',
      thisMonth: 'Este mes',
      lastMonth: 'Mes pasado',
      custom: 'Personalizado',
    };
    return rangeLabels[filters.timeRange] ?? '';
  };

  const renderTicketDistribution = (data: Record<string, unknown>[]) => {
    if (data.length === 0) return null;
    const maxCount = Math.max(...data.map((d) => d.count as number), 1);
    return (
      <div className="space-y-2 pt-2">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Distribución</p>
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-text-secondary w-24 shrink-0 text-right">{item.range as string}</span>
            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full transition-all duration-300"
                style={{ width: `${((item.count as number) / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-8 text-right">{item.count as number}</span>
            <span className="text-xs text-text-secondary w-12 text-right">{String(item.percentage)}%</span>
          </div>
        ))}
      </div>
    );
  };

  const handleTimeRangeChange = (value: string) => {
    const range = value as ReportTimeRange;
    if (range === 'custom') {
      setShowCustomDate(true);
      setFilters({ timeRange: 'custom' });
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
      display: container.style.display,
      position: container.style.position,
      top: container.style.top,
      left: container.style.left,
      opacity: container.style.opacity,
      zIndex: container.style.zIndex,
      pointerEvents: container.style.pointerEvents,
    };

    try {
      container.style.display = 'block';
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.opacity = '1';
      container.style.zIndex = '9999';
      container.style.pointerEvents = 'none';

      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => setTimeout(resolve, 50));

      const element = printRef.current;
      const html2pdf = (await import('html2pdf.js')).default;
      const fileName = `Sasa-Reporte-${new Date().toISOString().slice(0, 10)}.pdf`;
      
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
      container.style.display = originalStyles.display;
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
    <>
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 size={22} className="text-primary" />
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
              onClick={() => { setShowCustomDate(false); setFilters({ timeRange: 'thisMonth' }); }}
            >
              Cerrar
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <Card>
          <EmptyState
            icon={<BarChart3 size={32} />}
            title="No se pudieron cargar los reportes"
            description={error}
          />
        </Card>
      )}

      {/* Tabs Desktop */}
      <div className="hidden sm:flex items-center gap-1 bg-surface-alt/80 rounded-xl p-1 shadow-sm">
        {TABS.map((tab) => (
          <Tooltip key={tab.id} content={`Ver ${tab.label.toLowerCase()}`} position="bottom">
            <button
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-text-secondary hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Content — KeepAlive: todos los panels en DOM, solo cambia visibilidad */}
      <div className="space-y-4 sm:space-y-6">
        <div className={`print-section ${activeTab !== 'summary' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
            <ExecutiveSummary data={summary} loading={loading} onKpiClick={handleKpiClick} />
          </Suspense>
        </div>
        <div className={`print-section ${activeTab !== 'profits' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
            <ProfitChart data={profitOverTime} loading={loading} />
          </Suspense>
        </div>
        <div className={`print-section space-y-4 sm:space-y-6 ${activeTab !== 'products' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
            <InsightsCarousel
              topCategories={topCategories}
              worstCategories={worstCategories}
              topProducts={topProducts}
              worstProducts={worstProducts}
              topByVolume={topByVolume}
              loading={loading}
            />
            <TopProductsChart data={topProducts} loading={loading} />
            <PaymentBreakdown data={paymentBreakdown} loading={loading} />
          </Suspense>
        </div>
        <div className={`print-section ${activeTab !== 'cash' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
            <CashAnalysis data={cashAnalysis} loading={loading} />
          </Suspense>
        </div>
      </div>
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

      <DrillDownModal
        isOpen={!!activeDrillDown}
        onClose={() => setActiveDrillDown(null)}
        title={activeDrillDown ? drillDownConfigs[activeDrillDown].title : ''}
        subtitle={activeDrillDown ? getSubtitle() : undefined}
        columns={activeDrillDown ? drillDownConfigs[activeDrillDown].columns : []}
        data={drillDownData}
        loading={drillDownLoading}
        footerSummary={activeDrillDown && drillDownConfigs[activeDrillDown].footerSummary ? drillDownConfigs[activeDrillDown].footerSummary(drillDownData) : undefined}
      >
        {activeDrillDown === 'ticket' && renderTicketDistribution(drillDownData)}
      </DrillDownModal>

      {isGeneratingPdf && (
        <div className="fixed inset-0 z-99999 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white shadow-2xl border border-gray-100 animate-slide-down">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <Printer size={28} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Generando PDF</p>
              <p className="text-xs text-text-secondary mt-1">Esto puede tomar unos segundos...</p>
            </div>
            <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-shimmer" style={{ width: '40%', backgroundSize: '200px 100%' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
