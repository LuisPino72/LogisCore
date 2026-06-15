import { Card, Spinner } from '@/common/components';
import { Users, UserCheck, TrendingUp, ShoppingCart, Crown, ChevronRight } from 'lucide-react';
import type { CustomersSummaryData, DrillDownType } from '@/features/reports/types';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface CustomersReportProps {
  data: CustomersSummaryData | null;
  loading: boolean;
  onKpiClick?: (type: DrillDownType) => void;
}

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  gradient: 'blue' | 'green' | 'amber' | 'purple';
  onClick?: () => void;
}

function KpiCard({ label, value, subtitle, icon, gradient, onClick }: KpiCardProps) {
  const gradients = {
    blue: 'from-primary/5 to-primary/[0.02] border-primary/20',
    green: 'from-success/5 to-success/[0.02] border-success/20',
    amber: 'from-accent/5 to-accent/[0.02] border-accent/20',
    purple: 'from-purple-500/5 to-purple-500/[0.02] border-purple-500/20',
  };

  const iconBgs = {
    blue: 'bg-primary/15 text-primary',
    green: 'bg-success/15 text-success',
    amber: 'bg-accent/15 text-accent',
    purple: 'bg-purple-500/15 text-purple-500',
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
      <div className="space-y-0.5 sm:space-y-1 pr-7 sm:pr-9">
        <p className="text-xs sm:text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
        <div className="text-base sm:text-lg font-bold text-gray-900 leading-tight truncate">{value}</div>
        {subtitle && <div className="text-xs sm:text-xs text-gray-500 leading-tight truncate">{subtitle}</div>}
      </div>
      {onClick && (
        <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 text-gray-600/40">
          <ChevronRight size={14} />
        </div>
      )}
    </Card>
  );
}

export function CustomersReport({ data, loading, onKpiClick }: CustomersReportProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3 text-gray-500">
          <Users size={20} />
          <p className="text-sm">No hay datos de clientes disponibles.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <h3 className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-2">
        <Users size={16} className="text-primary" />
        Clientes
      </h3>

      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        <KpiCard
          label="Total Clientes"
          value={String(data.totalCustomers)}
          icon={<Users size={14} className="sm:w-4 sm:h-4" />}
          gradient="blue"
          onClick={() => onKpiClick?.('clientesRanking')}
        />
        <KpiCard
          label="Activos"
          value={String(data.activeCustomers)}
          subtitle={`${data.newCustomers} nuevos`}
          icon={<UserCheck size={14} className="sm:w-4 sm:h-4" />}
          gradient="green"
          onClick={() => onKpiClick?.('topClientes')}
        />
        <KpiCard
          label="Retención"
          value={`${data.retentionRate}%`}
          subtitle={`${data.returningCustomers} recurrentes`}
          icon={<TrendingUp size={14} className="sm:w-4 sm:h-4" />}
          gradient="amber"
        />
        <KpiCard
          label="Ticket Prom."
          value={formatUsd(data.averageTicketUsd)}
          subtitle={formatBs(data.averageTicketBs)}
          icon={<ShoppingCart size={14} className="sm:w-4 sm:h-4" />}
          gradient="purple"
          onClick={() => onKpiClick?.('topClientes')}
        />
        {data.topCustomerName && (
          <KpiCard
            label="Top Cliente"
            value={data.topCustomerName}
            subtitle={data.topCustomerSpentUsd ? formatUsd(data.topCustomerSpentUsd) : undefined}
            icon={<Crown size={14} className="sm:w-4 sm:h-4" />}
            gradient="amber"
            onClick={() => onKpiClick?.('topClientes')}
          />
        )}
      </div>
    </div>
  );
}
