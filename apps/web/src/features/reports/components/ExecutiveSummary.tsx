import { Card, Badge } from '@/common/components';
import { TrendingUp, TrendingDown, ShoppingCart, DollarSign, CreditCard, Package } from 'lucide-react';
import type { ExecutiveSummaryData } from '@/features/reports/types';

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData | null;
  loading: boolean;
}

function KpiCard({
  label,
  value,
  subtitle,
  icon,
  variant,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}) {
  const variantClasses = {
    default: 'bg-surface border-border',
    success: 'bg-success/5 border-success/20',
    danger: 'bg-danger/5 border-danger/20',
    warning: 'bg-warning/5 border-warning/20',
  };

  return (
    <Card className={`p-4 border ${variantClasses[variant ?? 'default']}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
        <div className="p-2 rounded-lg bg-gray-100 text-gray-600">{icon}</div>
      </div>
    </Card>
  );
}

export function ExecutiveSummary({ data, loading }: ExecutiveSummaryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4 h-24 animate-pulse bg-gray-100"><div /></Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const formatBs = (v: number) =>
    new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(v);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-gray-900">Resumen Ejecutivo</h2>
        {data.salesVsYesterdayPercent !== undefined && (
          <Badge variant={data.salesVsYesterdayPercent >= 0 ? 'success' : 'danger'}>
            {data.salesVsYesterdayPercent >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span className="ml-1">{Math.abs(data.salesVsYesterdayPercent)}% vs ayer</span>
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Ventas Totales"
          value={formatBs(data.totalSalesBs)}
          subtitle={`${data.totalTransactions} transacciones`}
          icon={<ShoppingCart size={18} />}
        />
        <KpiCard
          label="Ganancia Bruta"
          value={formatBs(data.grossProfitBs)}
          subtitle={`Margen ${data.profitMarginPercent}%`}
          icon={<TrendingUp size={18} />}
          variant={data.grossProfitBs >= 0 ? 'success' : 'danger'}
        />
        <KpiCard
          label="Ticket Promedio"
          value={formatBs(data.averageTicketBs)}
          icon={<DollarSign size={18} />}
        />
        <KpiCard
          label="IGTF Total"
          value={formatBs(data.totalIgtfBs)}
          icon={<CreditCard size={18} />}
        />
      </div>

      {data.topProductName && (
        <Card className="p-3 flex items-center gap-3 bg-primary/5 border-primary/20">
          <Package size={18} className="text-primary shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Producto más rentable</p>
            <p className="text-sm font-semibold text-gray-900">{data.topProductName}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
