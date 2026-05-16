import { Card, Badge } from '@/common/components';
import { TrendingUp, TrendingDown, ShoppingCart, DollarSign, CreditCard, Package, ArrowUpRight, Receipt } from 'lucide-react';
import type { ExecutiveSummaryData } from '@/features/reports/types';
import { formatBs } from '@/lib/formatBs';

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData | null;
  loading: boolean;
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
    blue: 'from-blue-50 to-blue-100/50 border-blue-200/60',
    green: 'from-emerald-50 to-emerald-100/50 border-emerald-200/60',
    amber: 'from-amber-50 to-amber-100/50 border-amber-200/60',
    red: 'from-red-50 to-red-100/50 border-red-200/60',
  };

  const iconBgs = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <Card className={`relative p-4 border bg-linear-to-br ${gradients[gradient]} transition-shadow hover:shadow-md`}>
      <div className={`absolute top-2 right-2 p-1.5 rounded-lg ${iconBgs[gradient]}`}>
        {icon}
      </div>
      <div className="space-y-1.5 pr-10">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        {subtitle && <p className="text-xs text-text-secondary truncate">{subtitle}</p>}
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend.positive ? 'text-success' : 'text-danger'}`}>
            {trend.positive ? <ArrowUpRight size={12} /> : <TrendingDown size={12} />}
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
          value={formatBs(data.totalSalesBs)}
          subtitle={`${data.totalTransactions} transacciones`}
          icon={<ShoppingCart size={18} />}
          gradient="blue"
          trend={data.salesVsYesterdayPercent !== undefined ? { value: data.salesVsYesterdayPercent, positive: data.salesVsYesterdayPercent >= 0 } : undefined}
        />
        <KpiCard
          label="Ganancia Bruta"
          value={formatBs(data.grossProfitBs)}
          subtitle={`Margen ${data.profitMarginPercent}%`}
          icon={<TrendingUp size={18} />}
          gradient={data.grossProfitBs >= 0 ? 'green' : 'red'}
        />
        <KpiCard
          label="Ticket Promedio"
          value={formatBs(data.averageTicketBs)}
          icon={<DollarSign size={18} />}
          gradient="amber"
        />
        <KpiCard
          label="IGTF Total"
          value={formatBs(data.totalIgtfBs)}
          icon={<CreditCard size={18} />}
          gradient="red"
        />
        <KpiCard
          label="Gastos de Consumo"
          value={formatBs(data.nonSellableExpensesBs)}
          subtitle={`USD ${data.nonSellableExpensesUsd.toFixed(2)}`}
          icon={<Receipt size={18} />}
          gradient="amber"
        />
      </div>

      {data.topProductName && (
        <Card className="p-3 flex items-center gap-3 bg-linear-to-r from-primary/5 to-primary/10 border-primary/20 transition-shadow hover:shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Package size={18} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-secondary">Producto más rentable</p>
            <p className="text-sm font-semibold text-gray-900 truncate">{data.topProductName}</p>
          </div>
          <Badge variant="info" className="shrink-0">
            #1
          </Badge>
        </Card>
      )}
    </div>
  );
}
