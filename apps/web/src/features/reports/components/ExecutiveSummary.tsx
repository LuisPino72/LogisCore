import { Card, Badge } from '@/common/components';
import { TrendingUp, TrendingDown, ShoppingCart, DollarSign, ArrowUpRight } from 'lucide-react';
import type { ExecutiveSummaryData } from '@/features/reports/types';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData | null;
  loading: boolean;
}

function formatDual(bs: number, usd: number): string {
  return `${formatBs(bs)} / ${formatUsd(usd)}`;
}

function KpiCard({
  label,
  value,
  subtitle,
  icon,
  gradient,
  trend,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  gradient: 'blue' | 'green' | 'amber' | 'red';
  trend?: { value: number; positive: boolean };
}) {
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
    <Card className={`relative p-3 sm:p-4 border bg-linear-to-br ${gradients[gradient]} transition-shadow hover:shadow-md`}>
      <div className={`absolute top-1.5 right-1.5 sm:top-2 sm:right-2 p-1 sm:p-1.5 rounded-lg ${iconBgs[gradient]}`}>
        {icon}
      </div>
      <div className="space-y-1 pr-8 sm:pr-10">
        <p className="text-[10px] sm:text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</p>
        <p className="text-xs sm:text-lg font-bold text-gray-900 truncate">{value}</p>
        {subtitle && <p className="text-[10px] sm:text-xs text-text-secondary truncate">{subtitle}</p>}
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] sm:text-xs font-medium ${trend.positive ? 'text-success' : 'text-danger'}`}>
            {trend.positive ? <ArrowUpRight size={10} className="sm:w-3 sm:h-3" /> : <TrendingDown size={10} className="sm:w-3 sm:h-3" />}
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
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

export function ExecutiveSummary({ data, loading }: ExecutiveSummaryProps) {
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

  if (!data) return null;

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Ventas Totales"
          value={formatDual(data.totalSalesBs, data.totalSalesUsd)}
          subtitle={`${data.totalTransactions} transacciones`}
          icon={<ShoppingCart size={18} />}
          gradient="blue"
          trend={data.salesVsYesterdayPercent !== undefined ? { value: data.salesVsYesterdayPercent, positive: data.salesVsYesterdayPercent >= 0 } : undefined}
        />
        <KpiCard
          label="Ganancia Bruta"
          value={formatDual(data.grossProfitBs, data.grossProfitUsd)}
          subtitle={`Margen ${data.profitMarginPercent}%`}
          icon={<TrendingUp size={18} />}
          gradient={data.grossProfitBs >= 0 ? 'green' : 'red'}
        />
        <KpiCard
          label="Gasto Total"
          value={formatDual(data.totalCostBs, data.totalCostUsd)}
          icon={<DollarSign size={18} />}
          gradient="amber"
        />
        <KpiCard
          label="Ticket Promedio"
          value={formatDual(data.averageTicketBs, data.averageTicketUsd)}
          icon={<DollarSign size={18} />}
          gradient="amber"
        />
      </div>

      {data.topProductName && (
        <Card className="p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3 bg-linear-to-r from-primary/5 to-primary/10 border-primary/20 transition-shadow hover:shadow-sm">
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
        </Card>
      )}
    </div>
  );
}
