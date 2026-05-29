import { Card, Badge, Tooltip, EmptyState } from '@/common/components';
import { TrendingUp, TrendingDown, ShoppingCart, DollarSign, ArrowUpRight, ChevronRight, BarChart3, Receipt } from 'lucide-react';
import type { ExecutiveSummaryData, DrillDownType } from '@/features/reports/types';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData | null;
  loading: boolean;
  onKpiClick?: (type: DrillDownType) => void;
}

function formatDual(bs: number, usd: number): React.ReactNode {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-xs sm:text-lg font-bold text-gray-900 truncate">{formatBs(bs)}</span>
      <span className="text-xs sm:text-lg font-semibold text-text-secondary truncate">{formatUsd(usd)}</span>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  gradient: 'blue' | 'green' | 'amber' | 'red';
  trend?: { value: number; positive: boolean };
  onClick?: () => void;
}

function KpiCard({
  label,
  value,
  subtitle,
  icon,
  gradient,
  trend,
  onClick,
}: KpiCardProps) {
  const gradients = {
    blue: 'from-primary/5 to-primary/[0.02] border-primary/20',
    green: 'from-success/5 to-success/[0.02] border-success/20',
    amber: 'from-accent/5 to-accent/[0.02] border-accent/20',
    red: 'from-danger/5 to-danger/[0.02] border-danger/20',
  };

  const iconBgs = {
    blue: 'bg-primary/15 text-primary',
    green: 'bg-success/15 text-success',
    amber: 'bg-accent/15 text-accent',
    red: 'bg-danger/15 text-danger',
  };

  return (
    <Card
      className={`relative p-3 sm:p-4 border bg-linear-to-br ${gradients[gradient]} transition-shadow ${onClick ? 'cursor-pointer hover:shadow-lg active:scale-[0.98]' : 'hover:shadow-md'}`}
      interactive={!!onClick}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      <div className={`absolute top-1.5 right-1.5 sm:top-2 sm:right-2 p-1 sm:p-1.5 rounded-lg ${iconBgs[gradient]}`}>
        {icon}
      </div>
      <div className="space-y-1 pr-8 sm:pr-10">
        <p className="text-[10px] sm:text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</p>
        <div className="truncate">{value}</div>
        {subtitle && <div className="text-[10px] sm:text-xs text-text-secondary truncate">{subtitle}</div>}
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] sm:text-xs font-medium ${trend.positive ? 'text-success' : 'text-danger'}`}>
            {trend.positive ? <ArrowUpRight size={10} className="sm:w-3 sm:h-3" /> : <TrendingDown size={10} className="sm:w-3 sm:h-3" />}
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
      {onClick && (
        <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 text-text-secondary/40">
          <ChevronRight size={14} />
        </div>
      )}
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card className="relative p-4 border bg-linear-to-br from-gray-50 to-gray-100/50">
      <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-gray-200">
        <div className="skeleton h-4 w-4 rounded" />
      </div>
      <div className="space-y-2 pr-10">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-6 w-28 rounded" />
        <div className="skeleton h-3 w-16 rounded" />
      </div>
    </Card>
  );
}

export function ExecutiveSummary({ data, loading, onKpiClick }: ExecutiveSummaryProps) {
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
      </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          label="Ventas Totales"
          value={formatDual(data.totalSalesBs, data.totalSalesUsd)}
          subtitle={`${data.totalTransactions} transacciones`}
          icon={<ShoppingCart size={18} />}
          gradient="blue"
          trend={data.salesVsYesterdayPercent !== undefined ? { value: data.salesVsYesterdayPercent, positive: data.salesVsYesterdayPercent >= 0 } : undefined}
          onClick={onKpiClick ? () => onKpiClick('ventas') : undefined}
        />
        <KpiCard
          label="Ganancia Bruta"
          value={formatDual(data.grossProfitBs, data.grossProfitUsd)}
          subtitle={`Margen ${data.profitMarginPercent}%`}
          icon={<TrendingUp size={18} />}
          gradient={data.grossProfitBs >= 0 ? 'green' : 'red'}
          onClick={onKpiClick ? () => onKpiClick('ganancia') : undefined}
        />
         <KpiCard
            label="Gasto Total"
            value={formatDual(
              data.totalCostBs + data.totalExpensesBs,
              data.totalCostUsd + data.totalExpensesUsd,
            )}
            subtitle={
              <div className="flex flex-col gap-0.5 text-[10px] sm:text-xs text-text-secondary">
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
          />
        <KpiCard
          label="Promedio de ventas"
          value={formatDual(data.averageTicketBs, data.averageTicketUsd)}
          icon={<DollarSign size={18} />}
          gradient="amber"
          onClick={onKpiClick ? () => onKpiClick('ticket') : undefined}
        />
        <KpiCard
          label="Descuentos aplicados"
          value={
            <div className="flex flex-col leading-tight">
              <span className="text-xs sm:text-lg font-bold text-danger truncate">-{formatBs(data.totalDiscountBs)}</span>
              <span className="text-xs sm:text-lg font-semibold text-text-secondary truncate">-{formatUsd(data.totalDiscountUsd)}</span>
            </div>
          }
          icon={<DollarSign size={18} />}
          gradient="red"
          onClick={onKpiClick ? () => onKpiClick('descuentos') : undefined}
        />
        <KpiCard
          label="IVA Acumulado"
          value={formatDual(data.totalIvaBs, data.totalIvaUsd)}
          subtitle="Impuesto al valor agregado (16%)"
          icon={<Receipt size={18} />}
          gradient="blue"
        />
      </div>

      {data.topProductName && (
        <Card
          className="p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3 bg-linear-to-r from-primary/5 to-primary/10 border-primary/20 transition-shadow hover:shadow-md active:scale-[0.98]"
          interactive={!!onKpiClick}
          onClick={onKpiClick ? () => onKpiClick('topProducto') : undefined}
          role={onKpiClick ? 'button' : undefined}
        >
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingCart size={14} className="sm:w-4.5 sm:h-4.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs text-text-secondary">Producto m&aacute;s rentable</p>
            <p className="text-xs sm:text-sm font-semibold text-gray-900 wrap-break-word">{data.topProductName}</p>
          </div>
          <Badge variant="info" className="shrink-0">
            #1
          </Badge>
          {onKpiClick && <ChevronRight size={14} className="text-text-secondary/40 shrink-0" />}
        </Card>
      )}
    </div>
  );
}
