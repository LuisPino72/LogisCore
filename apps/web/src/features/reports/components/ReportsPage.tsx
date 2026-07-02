import { useState, Suspense, lazy, useRef, useCallback, type ReactNode } from 'react';
import { Card, Button, Select, Spinner, BottomNav, DatePicker, ModuleOnboarding, type BottomNavItem, EmptyState, Tooltip, DrillDownModal } from '@/common/components';
import { logger } from '../../../lib/logger';
import type { Column } from '@/common/components';
import { BarChart3, PieChart, ShoppingBag, Wallet, FileText, TrendingUp, ShieldBan, Printer, Users, Truck } from 'lucide-react';
import { useAuthStore } from '../../auth/stores/authStore';
import { useReports } from '../hooks/useReports';
import { useDrillDown } from '../hooks/useDrillDown';
import { useToastStore } from '../../../stores/toastStore';
import { ExportButton } from './ExportButton';
import { ExecutiveSummary } from './ExecutiveSummary';
import { InsightsCarousel } from './InsightsCarousel';
import { PrintView } from './PrintView';
import type { ReportTimeRange, ReportTab, DrillDownType } from '../types';
import { formatBs, formatUsd } from '@/lib/formatBs';
import '../print.css';

const ProfitChart = lazy(() => import('./ProfitChart').then((m) => ({ default: m.ProfitChart })));
const TopProductsChart = lazy(() => import('./TopProductsChart').then((m) => ({ default: m.TopProductsChart })));
const PaymentBreakdown = lazy(() => import('./PaymentBreakdown').then((m) => ({ default: m.PaymentBreakdown })));
const CashAnalysis = lazy(() => import('./CashAnalysis').then((m) => ({ default: m.CashAnalysis })));
const ExpenseBreakdownChart = lazy(() => import('./ExpenseBreakdownChart').then((m) => ({ default: m.ExpenseBreakdownChart })));
const CustomersReport = lazy(() => import('./CustomersReport').then((m) => ({ default: m.CustomersReport })));
const ProductionReport = lazy(() => import('./ProductionReport').then((m) => ({ default: m.ProductionReport })));
const DeliverySettlementReport = lazy(() => import('./DeliverySettlementReport').then((m) => ({ default: m.DeliverySettlementReport })));

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
  { id: 'delivery', label: 'Liquidación', icon: <Truck size={20} /> },
  { id: 'more', label: 'Más', icon: <Users size={20} /> },
];

const TAB_LABELS: Record<string, string> = {
  summary: 'Resumen',
  profits: 'Ganancias',
  products: 'Productos',
  cash: 'Caja',
  delivery: 'Liquidación',
  more: 'Más',
};

const PAYMENT_LABELS: Record<string, string> = {
  efectivo_bs: 'Efectivo Bs',
  pago_movil: 'Pago Móvil',
  tarjeta_bs: 'Tarjeta Bs',
  efectivo_usd: 'Efectivo $',
};

const DRILL_DOWN_CONFIGS: Record<DrillDownType, {
  title: string;
  columns: Column<Record<string, unknown>>[];
  footerSummary?: (data: Record<string, unknown>[]) => { label: string; value: ReactNode }[];
}> = {
  ventas: {
    title: 'Ventas Totales',
    columns: [
      { key: 'date', header: 'Fecha' },
      { key: 'time', header: 'Hora', hideOnMobile: true },
      { key: 'itemCount', header: 'Items', className: 'text-center' },
      { key: 'totalBs', header: 'Total Bs', render: (item) => formatBs(item.totalBs as number) },
      { key: 'totalUsd', header: 'Total $', render: (item) => formatUsd(item.totalUsd as number) },
      { key: 'paymentMethod', header: 'Pago', render: (item) => PAYMENT_LABELS[item.paymentMethod as string] ?? item.paymentMethod as string, hideOnMobile: true },
    ],
    footerSummary: (data) => {
      const totalBs = data.reduce((s, d) => s + (d.totalBs as number), 0);
      const totalUsd = data.reduce((s, d) => s + (d.totalUsd as number), 0);
      return [
        { label: 'Total Bs', value: formatBs(totalBs) },
        { label: 'Total $', value: formatUsd(totalUsd) },
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
      { key: 'amountUsd', header: 'Monto $', render: (item) => formatUsd(item.amountUsd as number) },
    ],
    footerSummary: (data) => {
      const totalBs = data.reduce((s, d) => s + (d.amountBs as number), 0);
      const totalUsd = data.reduce((s, d) => s + (d.amountUsd as number), 0);
      return [
        { label: 'Total Bs', value: formatBs(totalBs) },
        { label: 'Total $', value: formatUsd(totalUsd) },
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
  descuentos: {
    title: 'Descuentos Aplicados',
    columns: [
      { key: 'date', header: 'Fecha', render: (item) => new Date(item.date as string).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) },
      { key: 'subtotalBs', header: 'Subtotal', render: (item) => formatBs(item.subtotalBs as number), hideOnMobile: true },
      { key: 'discountBs', header: 'Descuento', render: (item) => <span className="text-danger font-bold">-{formatBs(item.discountBs as number)}</span> },
      { key: 'totalBs', header: 'Total', render: (item) => formatBs(item.totalBs as number) },
    ],
    footerSummary: (data) => {
      const totalDiscountBs = data.reduce((s, d) => s + (d.discountBs as number), 0);
      const totalDiscountUsd = data.reduce((s, d) => s + (d.discountUsd as number), 0);
      const totalSubtotal = data.reduce((s, d) => s + (d.subtotalBs as number), 0);
      return [
        { label: 'Subtotal', value: formatBs(totalSubtotal) },
        { label: 'Descuento total', value: <span className="text-danger font-bold">-{formatBs(totalDiscountBs)}</span> },
        { label: 'Descuento $', value: <span className="text-danger">-{formatUsd(totalDiscountUsd)}</span> },
      ];
    },
  },
  topClientes: {
    title: 'Top Clientes por Gasto',
    columns: [
      { key: 'customerName', header: 'Cliente', render: (item) => <span className="wrap-break-word">{item.customerName as string}</span> },
      { key: 'purchaseCount', header: 'Compras', className: 'text-center' },
      { key: 'totalSpentUsd', header: 'Total $', render: (item) => formatUsd(item.totalSpentUsd as number) },
      { key: 'totalSpentBs', header: 'Total Bs', render: (item) => formatBs(item.totalSpentBs as number), hideOnMobile: true },
      { key: 'averageTicketUsd', header: 'Ticket Prom.', render: (item) => formatUsd(item.averageTicketUsd as number), hideOnMobile: true },
      { key: 'lastPurchaseAt', header: 'Última Compra', render: (item) => item.lastPurchaseAt ? new Date(item.lastPurchaseAt as string).toLocaleDateString('es-VE') : '-', hideOnMobile: true },
    ],
    footerSummary: (data) => {
      const totalSpentBs = data.reduce((s, d) => s + (d.totalSpentBs as number), 0);
      const totalSpentUsd = data.reduce((s, d) => s + (d.totalSpentUsd as number), 0);
      const totalPurchases = data.reduce((s, d) => s + (d.purchaseCount as number), 0);
      return [
        { label: 'Total', value: `${formatBs(totalSpentBs)} / ${formatUsd(totalSpentUsd)}` },
        { label: 'Transacciones', value: String(totalPurchases) },
      ];
    },
  },
  clientesRanking: {
    title: 'Ranking de Clientes',
    columns: [
      { key: 'customerName', header: 'Cliente', render: (item) => <span className="wrap-break-word">{item.customerName as string}</span> },
      { key: 'cedula', header: 'Cédula', hideOnMobile: true },
      { key: 'purchaseCount', header: 'Compras', className: 'text-center' },
      { key: 'totalSpentUsd', header: 'Total $', render: (item) => formatUsd(item.totalSpentUsd as number) },
      { key: 'totalSpentBs', header: 'Total Bs', render: (item) => formatBs(item.totalSpentBs as number), hideOnMobile: true },
      { key: 'averageTicketUsd', header: 'Ticket Prom.', render: (item) => formatUsd(item.averageTicketUsd as number), hideOnMobile: true },
      { key: 'lastPurchaseAt', header: 'Última Compra', render: (item) => item.lastPurchaseAt ? new Date(item.lastPurchaseAt as string).toLocaleDateString('es-VE') : '-', hideOnMobile: true },
    ],
    footerSummary: (data) => {
      const totalSpentBs = data.reduce((s, d) => s + (d.totalSpentBs as number), 0);
      const totalSpentUsd = data.reduce((s, d) => s + (d.totalSpentUsd as number), 0);
      return [
        { label: 'Total', value: `${formatBs(totalSpentBs)} / ${formatUsd(totalSpentUsd)}` },
        { label: 'Clientes', value: String(data.length) },
      ];
    },
  },
  produccionRecetas: {
    title: 'Rentabilidad por Receta',
    columns: [
      { key: 'recipeName', header: 'Receta', render: (item) => <span className="wrap-break-word">{item.recipeName as string}</span> },
      { key: 'productName', header: 'Producto', hideOnMobile: true, render: (item) => <span className="wrap-break-word">{item.productName as string}</span> },
      { key: 'mode', header: 'Tipo', className: 'text-center', render: (item) => item.mode === 'batch' ? 'Lotes' : 'Ensamblaje' },
      { key: 'timesProduced', header: 'Veces', className: 'text-center' },
      { key: 'totalQuantityProduced', header: 'Producido', className: 'text-center' },
      { key: 'costPerUnitUsd', header: 'Costo/Unidad', render: (item) => formatUsd(item.costPerUnitUsd as number) },
      { key: 'wastePct', header: 'Merma', render: (item) => `${item.wastePct}%`, className: 'text-center' },
    ],
    footerSummary: (data) => {
      const totalProduced = data.reduce((s, d) => s + (d.totalQuantityProduced as number), 0);
      const totalCost = data.reduce((s, d) => s + (d.totalCostUsd as number), 0);
      return [
        { label: 'Total Producido', value: String(totalProduced) },
        { label: 'Costo Total', value: formatUsd(totalCost) },
      ];
    },
  },
  produccionOrdenes: {
    title: 'Órdenes de Producción',
    columns: [
      { key: 'totalRecipes', header: 'Recetas Totales', className: 'text-center' },
      { key: 'activeRecipes', header: 'Recetas Activas', className: 'text-center' },
      { key: 'totalOrders', header: 'Órdenes', className: 'text-center' },
      { key: 'completedOrders', header: 'Completadas', className: 'text-center' },
      { key: 'cancelledOrders', header: 'Canceladas', className: 'text-center' },
      { key: 'totalQuantityProduced', header: 'Unidades', className: 'text-center' },
      { key: 'averageWastePct', header: 'Merma Prom.', render: (item) => `${item.averageWastePct}%`, className: 'text-center' },
      { key: 'totalIngredientCostUsd', header: 'Costo Ingredientes', render: (item) => formatUsd(item.totalIngredientCostUsd as number) },
    ],
  },
  pendientePorCobrar: {
    title: 'Pendiente por Cobrar',
    columns: [
      { key: 'customerName', header: 'Cliente' },
      { key: 'balance', header: 'Saldo', render: (item) => formatUsd(item.balance as number) },
      { key: 'creditLimit', header: 'Límite', render: (item) => formatUsd(item.creditLimit as number), hideOnMobile: true },
      { key: 'pendingSalesCount', header: 'Vtas. Pendientes', className: 'text-center' },
    ],
    footerSummary: (data) => {
      const totalBalance = data.reduce((s, d) => s + (d.balance as number), 0);
      return [
        { label: 'Total Pendiente', value: formatUsd(totalBalance) },
        { label: 'Clientes', value: String(data.length) },
      ];
    },
  },
  cuentasPorPagar: {
    title: 'Cuentas por Pagar',
    columns: [
      { key: 'supplierName', header: 'Proveedor' },
      { key: 'balance', header: 'Saldo', render: (item) => formatUsd(item.balance as number) },
      { key: 'pendingOrdersCount', header: 'Órdenes Pendientes', className: 'text-center' },
    ],
    footerSummary: (data) => {
      const totalBalance = data.reduce((s, d) => s + (d.balance as number), 0);
      return [
        { label: 'Total Pendiente', value: formatUsd(totalBalance) },
        { label: 'Proveedores', value: String(data.length) },
      ];
    },
  },
  produccionUnidades: {
    title: 'Unidades Producidas por Receta',
    columns: [
      { key: 'recipeName', header: 'Receta', render: (item) => <span className="wrap-break-word">{item.recipeName as string}</span> },
      { key: 'productName', header: 'Producto', hideOnMobile: true, render: (item) => <span className="wrap-break-word">{item.productName as string}</span> },
      { key: 'mode', header: 'Tipo', className: 'text-center', render: (item) => item.mode === 'batch' ? 'Lotes' : 'Ensamblaje' },
      { key: 'totalQuantityProduced', header: 'Unidades', className: 'text-center' },
      { key: 'costPerUnitUsd', header: 'Costo/Unidad', render: (item) => formatUsd(item.costPerUnitUsd as number) },
    ],
    footerSummary: (data) => {
      const totalProduced = data.reduce((s, d) => s + (d.totalQuantityProduced as number), 0);
      return [
        { label: 'Total Unidades', value: String(totalProduced) },
      ];
    },
  },
  produccionMerma: {
    title: 'Merma por Receta',
    columns: [
      { key: 'recipeName', header: 'Receta', render: (item) => <span className="wrap-break-word">{item.recipeName as string}</span> },
      { key: 'productName', header: 'Producto', hideOnMobile: true, render: (item) => <span className="wrap-break-word">{item.productName as string}</span> },
      { key: 'mode', header: 'Tipo', className: 'text-center', render: (item) => item.mode === 'batch' ? 'Lotes' : 'Ensamblaje' },
      { key: 'wastePct', header: 'Merma', render: (item) => `${item.wastePct}%`, className: 'text-center' },
      { key: 'totalQuantityProduced', header: 'Producido', className: 'text-center' },
      { key: 'costPerUnitUsd', header: 'Costo/Unidad', render: (item) => formatUsd(item.costPerUnitUsd as number) },
    ],
    footerSummary: (data) => {
      const avgWaste = data.reduce((s, d) => s + (d.wastePct as number), 0) / (data.length || 1);
      return [
        { label: 'Merma Promedio', value: `${avgWaste.toFixed(1)}%` },
        { label: 'Recetas', value: String(data.length) },
      ];
    },
  },
  produccionCostoIng: {
    title: 'Costos de Ingredientes por Receta',
    columns: [
      { key: 'recipeName', header: 'Receta', render: (item) => <span className="wrap-break-word">{item.recipeName as string}</span> },
      { key: 'productName', header: 'Producto', hideOnMobile: true },
      { key: 'totalQuantityProduced', header: 'Unidades', className: 'text-center' },
      { key: 'totalCostUsd', header: 'Costo Total $', render: (item) => formatUsd(item.totalCostUsd as number) },
      { key: 'costPerUnitUsd', header: 'Costo/Unidad', render: (item) => formatUsd(item.costPerUnitUsd as number) },
      { key: 'yieldUnit', header: 'Unidad', className: 'text-center' },
    ],
    footerSummary: (data) => {
      const totalCost = data.reduce((s, d) => s + (d.totalCostUsd as number), 0);
      return [
        { label: 'Costo Total', value: formatUsd(totalCost) },
        { label: 'Recetas', value: String(data.length) },
      ];
    },
  },
  produccionMasProducida: {
    title: 'Detalle de Receta Más Producida',
    columns: [
      { key: 'recipeName', header: 'Receta', render: (item) => <span className="wrap-break-word">{item.recipeName as string}</span> },
      { key: 'productName', header: 'Producto', hideOnMobile: true },
      { key: 'mode', header: 'Tipo', className: 'text-center', render: (item) => item.mode === 'batch' ? 'Lotes' : 'Ensamblaje' },
      { key: 'timesProduced', header: 'Veces Producida', className: 'text-center' },
      { key: 'totalQuantityProduced', header: 'Total Unidades', className: 'text-center' },
      { key: 'costPerUnitUsd', header: 'Costo/Unidad', render: (item) => formatUsd(item.costPerUnitUsd as number) },
      { key: 'wastePct', header: 'Merma', render: (item) => `${item.wastePct}%`, className: 'text-center' },
    ],
  },
};

interface ReportsPageProps {
  tenantId: string | null;
}

export function ReportsPage({ tenantId }: ReportsPageProps) {
  const role = useAuthStore((s) => s.session?.role);
  const { addToast } = useToastStore();
  const isOwner = role === 'owner' || role === 'admin';

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
    expenseBreakdown,
    customersSummary,
    customersRanking,
    productionSummary,
    recipeProfitability,
    lowStockProducts,
    deliverySettlementRows,
    fetchMoreTabData,
  } = useReports(tenantId);

  const { activeDrillDown, drillDownData, drillDownLoading, openDrillDown, closeDrillDown } = useDrillDown(tenantId, filters);

  const [showCustomDate, setShowCustomDate] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [printScope, setPrintScope] = useState<string>('all');

  const handlePrint = useCallback(async (scope: string = 'all') => {
    setPrintScope(scope);
    await new Promise(resolve => setTimeout(resolve, 0));

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
      const scopeSuffix = scope && scope !== 'all' ? `-${({ summary: 'Resumen', profits: 'Ganancias', products: 'Productos', cash: 'Caja', more: 'Mas', delivery: 'Liquidacion' })[scope] ?? scope}` : '';
      const fileName = `Sasa-Reporte${scopeSuffix}-${new Date().toISOString().slice(0, 10)}.pdf`;
      
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
      logger.error('ReportsPage', 'Error generando PDF:', error);
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
            <span className="text-xs text-gray-700 w-24 shrink-0 text-right">{item.range as string}</span>
            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full transition-all duration-300"
                style={{ width: `${((item.count as number) / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-8 text-right">{item.count as number}</span>
            <span className="text-xs text-gray-700 w-12 text-right">{String(item.percentage)}%</span>
          </div>
        ))}
      </div>
    );
  };

  const bottomNavItems: BottomNavItem[] = TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon,
    onClick: () => setActiveTab(tab.id),
  }));

  return (
    <>
    <div className="p-4 sm:p-6 pb-20 sm:pb-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-title font-bold" style={{ fontSize: 'var(--text-fluid-xl)' }}>Reportes</h1>
            <p className="text-xs text-gray-700">Análisis de ventas y ganancias</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700 uppercase tracking-wide hidden sm:block">Período</label>
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
          <Tooltip content="Exportar o imprimir reportes" variant="help" position="left">
            <ExportButton
              aria-label="Exportar o imprimir reportes"
              summary={summary}
              profitOverTime={profitOverTime}
              topProducts={topProducts}
              topCategories={topCategories}
              paymentBreakdown={paymentBreakdown}
              cashAnalysis={cashAnalysis}
              expenseBreakdown={expenseBreakdown}
              customersSummary={customersSummary}
              customersRanking={customersRanking}
              productionSummary={productionSummary}
              recipeProfitability={recipeProfitability}
              loading={loading}
              onPrint={handlePrint}
              isGeneratingPdf={isGeneratingPdf}
              fetchMoreTabData={fetchMoreTabData}
              activeTab={activeTab}
              activeTabLabel={TAB_LABELS[activeTab]}
              lowStockProducts={lowStockProducts}
              worstProducts={worstProducts}
              worstCategories={worstCategories}
              topByVolume={topByVolume}
              deliverySettlement={deliverySettlementRows}
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
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
                const clamped = v > today ? today : v;
                const end = filters.endDate ? filters.endDate.slice(0, 10) : '';
                const finalStart = clamped && end && clamped > end ? end : clamped;
                setFilters((f) => ({ ...f, startDate: finalStart ? `${finalStart}T00:00:00` : undefined }));
              }}
            />
          </div>
          <div className="flex-1">
            <DatePicker
              label="Hasta"
              value={filters.endDate ? filters.endDate.slice(0, 10) : ''}
              onChange={(e) => {
                const v = e.target.value;
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
                const clamped = v > today ? today : v;
                const start = filters.startDate ? filters.startDate.slice(0, 10) : '';
                const finalEnd = clamped && start && clamped < start ? start : clamped;
                setFilters((f) => ({ ...f, endDate: finalEnd ? `${finalEnd}T23:59:59` : undefined }));
              }}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="primary"
              size="sm"
              className="min-h-11"
              onClick={() => setFilters((f) => ({ ...f, timeRange: 'custom' }))}
            >
              Aplicar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
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
            <Button
              variant={activeTab === tab.id ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </Button>
          </Tooltip>
        ))}
      </div>

      {/* Content — KeepAlive: todos los panels en DOM, solo cambia visibilidad */}
      <div className="space-y-4 sm:space-y-6">
        <div className={`print-section ${activeTab !== 'summary' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
            <div className="animate-report-fade-in">
              <ExecutiveSummary data={summary} loading={loading} tenantId={tenantId ?? ''} onKpiClick={openDrillDown} />
            </div>
            <div className="animate-report-fade-in">
              <ExpenseBreakdownChart data={expenseBreakdown} loading={loading} />
            </div>
          </Suspense>
        </div>
        <div className={`print-section ${activeTab !== 'profits' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
            <div className="animate-report-fade-in">
              <ProfitChart data={profitOverTime} loading={loading} />
            </div>
          </Suspense>
        </div>
        <div className={`print-section space-y-4 sm:space-y-6 ${activeTab !== 'products' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
            <div className="animate-report-fade-in">
              <InsightsCarousel
                topCategories={topCategories}
                worstCategories={worstCategories}
                topProducts={topProducts}
                worstProducts={worstProducts}
                topByVolume={topByVolume}
                loading={loading}
              />
            </div>
            <div className="animate-report-fade-in">
              <TopProductsChart data={topProducts} loading={loading} />
            </div>
            <div className="animate-report-fade-in">
              <PaymentBreakdown data={paymentBreakdown} loading={loading} />
            </div>
          </Suspense>
        </div>
        <div className={`print-section ${activeTab !== 'cash' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
            <div className="animate-report-fade-in">
              <CashAnalysis data={cashAnalysis} loading={loading} />
            </div>
          </Suspense>
        </div>
        <div className={`print-section space-y-4 sm:space-y-6 ${activeTab !== 'more' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
            <div className="animate-report-fade-in">
              <CustomersReport data={customersSummary} loading={loading} onKpiClick={openDrillDown} />
            </div>
            <div className="animate-report-fade-in">
              <ProductionReport data={productionSummary} loading={loading} onKpiClick={openDrillDown} />
            </div>
            {lowStockProducts.length > 0 && (
              <div className="animate-report-fade-in">
                <Card className="p-4">
                  <h3 className="text-sm font-title font-bold text-gray-900 mb-3">Productos con bajo stock</h3>
                  <div className="divide-y divide-gray-100">
                    {lowStockProducts.map((p) => (
                      <div key={p.productId} className="flex items-center justify-between py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">SKU: {p.sku}</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-sm font-semibold text-danger">{p.stock}</p>
                          <p className="text-xs text-gray-500">Mín: {p.minStock}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </Suspense>
        </div>
        <div className={`print-section ${activeTab !== 'delivery' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="sm" /></div>}>
            <div className="animate-report-fade-in">
              <DeliverySettlementReport tenantId={tenantId ?? ''} filters={filters} />
            </div>
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
            description: 'Aquí ves cuánto vendiste, cuánto ganaste y qué productos se venden más. Selecciona un período para ver los datos.',
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
          scope={printScope}
          summary={summary}
          profitOverTime={profitOverTime}
          topProducts={topProducts}
          topCategories={topCategories}
          paymentBreakdown={paymentBreakdown}
          cashAnalysis={cashAnalysis}
          expenseBreakdown={expenseBreakdown}
          customersSummary={customersSummary}
          customersRanking={customersRanking}
          productionSummary={productionSummary}
          recipeProfitability={recipeProfitability}
          lowStockProducts={lowStockProducts}
          worstProducts={worstProducts}
          worstCategories={worstCategories}
          topByVolume={topByVolume}
          deliverySettlement={deliverySettlementRows}
        />
      </div>

      <DrillDownModal
        isOpen={!!activeDrillDown}
        onClose={closeDrillDown}
        title={activeDrillDown ? DRILL_DOWN_CONFIGS[activeDrillDown].title : ''}
        subtitle={activeDrillDown ? getSubtitle() : undefined}
        columns={activeDrillDown ? DRILL_DOWN_CONFIGS[activeDrillDown].columns : []}
        data={drillDownData}
        loading={drillDownLoading}
        footerSummary={activeDrillDown && DRILL_DOWN_CONFIGS[activeDrillDown].footerSummary ? DRILL_DOWN_CONFIGS[activeDrillDown].footerSummary(drillDownData) : undefined}
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
              <p className="text-xs text-gray-700 mt-1">Esto puede tomar unos segundos...</p>
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

