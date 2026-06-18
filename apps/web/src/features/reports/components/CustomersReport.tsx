import { Card, EmptyState, KpiCard, KpiSkeleton } from '@/common/components';
import { Users, UserCheck, TrendingUp, ShoppingCart, Crown } from 'lucide-react';
import type { CustomersSummaryData, DrillDownType } from '@/features/reports/types';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface CustomersReportProps {
  data: CustomersSummaryData | null;
  loading: boolean;
  onKpiClick?: (type: DrillDownType) => void;
}

export function CustomersReport({ data, loading, onKpiClick }: CustomersReportProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="p-4">
        <EmptyState
          icon={<Users size={20} />}
          title="No hay datos de clientes disponibles"
          description="Registra ventas o clientes para ver el reporte."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 animate-report-fade-in">
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
          animationDelay={0}
        />
        <KpiCard
          label="Activos"
          value={String(data.activeCustomers)}
          subtitle={`${data.newCustomers} nuevos`}
          icon={<UserCheck size={14} className="sm:w-4 sm:h-4" />}
          gradient="green"
          onClick={() => onKpiClick?.('topClientes')}
          animationDelay={0.05}
        />
        <KpiCard
          label="Retención"
          value={`${data.retentionRate}%`}
          subtitle={`${data.returningCustomers} recurrentes`}
          icon={<TrendingUp size={14} className="sm:w-4 sm:h-4" />}
          gradient="amber"
          animationDelay={0.1}
        />
        <KpiCard
          label="Ticket Prom."
          value={formatUsd(data.averageTicketUsd)}
          subtitle={formatBs(data.averageTicketBs)}
          icon={<ShoppingCart size={14} className="sm:w-4 sm:h-4" />}
          gradient="purple"
          onClick={() => onKpiClick?.('topClientes')}
          animationDelay={0.15}
        />
        {data.topCustomerName && (
          <KpiCard
            label="Top Cliente"
            value={data.topCustomerName}
            subtitle={data.topCustomerSpentUsd ? formatUsd(data.topCustomerSpentUsd) : undefined}
            icon={<Crown size={14} className="sm:w-4 sm:h-4" />}
            gradient="amber"
            onClick={() => onKpiClick?.('topClientes')}
            animationDelay={0.2}
          />
        )}
      </div>
    </div>
  );
}
