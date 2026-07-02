import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Card, Badge, Tooltip, EmptyState, KpiCard, KpiSkeleton } from '@/common/components';
import { TrendingUp, TrendingDown, ShoppingCart, DollarSign, BarChart3, Receipt, Wallet, CreditCard, Layers } from 'lucide-react';
import type { ExecutiveSummaryData, DrillDownType } from '@/features/reports/types';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { reportsService } from '../services/reportsService';

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData | null;
  loading: boolean;
  tenantId: string;
  onKpiClick?: (type: DrillDownType) => void;
}

function formatDual(bs: number, usd: number): React.ReactNode {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-xs sm:text-lg font-bold text-gray-900 truncate">{formatBs(bs)}</span>
      <span className="text-xs sm:text-lg font-semibold text-gray-700 truncate">{formatUsd(usd)}</span>
    </div>
  );
}

export function ExecutiveSummary({ data, loading, tenantId, onKpiClick }: ExecutiveSummaryProps) {
  const [pendingPayables, setPendingPayables] = useState<number | null>(null);
  const [registerNames, setRegisterNames] = useState<string[]>([]);

  useEffect(() => {
    if (data && tenantId) {
      reportsService.getPendingPayables(tenantId).then((total) => setPendingPayables(total)).catch(() => {});
    }
  }, [data, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const filters = { timeRange: 'today' as const };
    reportsService.getCashAnalysis(tenantId, filters).then((result) => {
      if (result.ok) {
        const names = result.data.map((r) => {
          const regName = r.registerName || 'Caja';
          const opName = r.operatorName ? ` (${r.operatorName})` : '';
          return `${regName}${opName}`;
        });
        setRegisterNames(names);
      }
    }).catch(() => {});
  }, [tenantId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-6 w-40 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={<BarChart3 size={32} />}
          title="Aún no hay datos para este período"
          description="Selecciona otro período o espera a tener ventas registradas."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-base font-title font-bold text-gray-900">Resumen Ejecutivo</h2>
        {data.salesVsYesterdayPercent !== undefined && (
          <Badge variant={data.salesVsYesterdayPercent >= 0 ? 'success' : 'danger'}>
            {data.salesVsYesterdayPercent >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span className="ml-1">{Math.abs(data.salesVsYesterdayPercent)}% vs ayer</span>
          </Badge>
        )}
        {data.activeRegistersCount > 0 && (
          <Tooltip content={
            registerNames.length > 0
              ? registerNames.join(', ')
              : `${data.activeRegistersCount} ${data.activeRegistersCount === 1 ? 'caja' : 'cajas'} activa${data.activeRegistersCount !== 1 ? 's' : ''} hoy`
          }>
            <Badge variant="info" className="cursor-help">
              <Layers size={12} />
              <span className="ml-1">{data.activeRegistersCount} {data.activeRegistersCount === 1 ? 'Caja' : 'Cajas'}</span>
            </Badge>
          </Tooltip>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Ventas Totales"
          value={formatDual(data.totalSalesBs, data.totalSalesUsd)}
          subtitle={`${data.totalTransactions} transacciones`}
          icon={<ShoppingCart size={18} />}
          gradient="blue"
          trend={data.salesVsYesterdayPercent !== undefined ? { value: data.salesVsYesterdayPercent, positive: data.salesVsYesterdayPercent >= 0 } : undefined}
          onClick={onKpiClick ? () => onKpiClick('ventas') : undefined}
          animationDelay={0}
        />
        <KpiCard
          label="Ganancia Bruta"
          value={formatDual(data.grossProfitBs, data.grossProfitUsd)}
          subtitle={`Margen ${data.profitMarginPercent}%`}
          icon={<TrendingUp size={18} />}
          gradient={data.grossProfitBs >= 0 ? 'green' : 'red'}
          onClick={onKpiClick ? () => onKpiClick('ganancia') : undefined}
          animationDelay={0.05}
        />
        <KpiCard
          label="Gasto Total"
          value={formatDual(
            data.totalCostBs + data.totalExpensesBs,
            data.totalCostUsd + data.totalExpensesUsd,
          )}
          subtitle={
            <div className="flex flex-col gap-0.5 text-xs sm:text-sm text-gray-700">
              <div className="flex items-center gap-1">
                <Tooltip content="Suma del costo de adquisición de los productos vendidos (COGS).">
                  <span className="underline decoration-dotted cursor-help">Costo compras</span>
                </Tooltip>
                <span>{formatUsd(data.totalCostUsd)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip content="Gastos operativos, no vendibles y ajustes de inventario.">
                  <span className="underline decoration-dotted cursor-help">Gastos operativos</span>
                </Tooltip>
                <span>{formatUsd(data.operatingExpensesUsd)}</span>
                <span className="text-text-tertiary">·</span>
                <span className="text-text-tertiary">Total {formatUsd(data.totalExpensesUsd)}</span>
              </div>
            </div>
          }
          icon={<DollarSign size={18} />}
          gradient="amber"
          onClick={onKpiClick ? () => onKpiClick('gastos') : undefined}
          animationDelay={0.1}
        />
        <KpiCard
          label="Promedio de ventas"
          value={formatDual(data.averageTicketBs, data.averageTicketUsd)}
          icon={<DollarSign size={18} />}
          gradient="amber"
          onClick={onKpiClick ? () => onKpiClick('ticket') : undefined}
          animationDelay={0.15}
        />
        <KpiCard
          label="Descuentos aplicados"
          value={
            <div className="flex flex-col leading-tight">
              <span className="text-xs sm:text-lg font-bold text-danger truncate">-{formatBs(data.totalDiscountBs)}</span>
              <span className="text-xs sm:text-lg font-semibold text-gray-700 truncate">-{formatUsd(data.totalDiscountUsd)}</span>
            </div>
          }
          icon={<DollarSign size={18} />}
          gradient="red"
          onClick={onKpiClick ? () => onKpiClick('descuentos') : undefined}
          animationDelay={0.2}
        />
        <KpiCard
          label="IVA Acumulado"
          value={formatDual(data.totalIvaBs, data.totalIvaUsd)}
          subtitle="Impuesto al Valor Agregado"
          icon={<Receipt size={18} />}
          gradient="blue"
          animationDelay={0.25}
        />
        <KpiCard
          label="IGTF Acumulado"
          value={<span className="text-xs sm:text-lg font-bold text-warning truncate">{formatBs(data.igtfTotal)}</span>}
          subtitle="Impuesto a Grandes Transacciones Financieras"
          icon={<Receipt size={18} />}
          gradient="amber"
          animationDelay={0.27}
        />
        <KpiCard
          label="Pendiente por cobrar"
          value={<span className="text-xs sm:text-lg font-bold text-warning truncate">{formatUsd(data.pendingCreditUsd)}</span>}
          subtitle={
            <div className="flex items-center gap-1.5">
              <span>{data.customersWithDebt} {data.customersWithDebt === 1 ? 'cliente' : 'clientes'}</span>
              {data.collectedCreditUsd > 0 && (
                <span className="text-success">· Cobrado {formatUsd(data.collectedCreditUsd)}</span>
              )}
            </div>
          }
          icon={<Wallet size={18} />}
          gradient="amber"
          onClick={onKpiClick ? () => onKpiClick('pendientePorCobrar') : undefined}
          animationDelay={0.3}
        />
        <KpiCard
          label="Cuentas por Pagar"
          value={<span className={cn("text-xs sm:text-lg font-bold truncate", (pendingPayables || 0) > 0 ? "text-danger" : "text-success")}>{formatUsd(pendingPayables ?? 0)}</span>}
          subtitle={pendingPayables !== null ? 'Total pendiente con proveedores' : 'Cargando...'}
          icon={<CreditCard size={18} />}
          gradient={(pendingPayables || 0) > 0 ? 'red' : 'green'}
          onClick={onKpiClick ? () => onKpiClick('cuentasPorPagar') : undefined}
          animationDelay={0.35}
        />
      </div>

      {data.topProductName && (
        <Card
          className="p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3 bg-linear-to-r from-primary/5 to-primary/10 border-primary/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] animate-report-fade-in"
          interactive={!!onKpiClick}
          onClick={onKpiClick ? () => onKpiClick('topProducto') : undefined}
          role={onKpiClick ? 'button' : undefined}
        >
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingCart size={14} className="sm:w-4.5 sm:h-4.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm text-gray-700">Producto más rentable</p>
            <p className="text-xs sm:text-sm font-semibold text-gray-900 wrap-break-word">{data.topProductName}</p>
          </div>
          <Badge variant="info" className="shrink-0">
            #1
          </Badge>
          {onKpiClick && <span className="text-gray-600/40 shrink-0">›</span>}
        </Card>
      )}
    </div>
  );
}
