import { Card, Spinner } from '@/common/components';
import { ChefHat, Package, AlertTriangle, TrendingUp, Hash, DollarSign, ChevronRight } from 'lucide-react';
import type { ProductionSummaryData, DrillDownType } from '@/features/reports/types';
import { formatUsd } from '@/lib/formatBs';

interface ProductionReportProps {
  data: ProductionSummaryData | null;
  loading: boolean;
  onKpiClick?: (type: DrillDownType) => void;
}

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  gradient: 'blue' | 'green' | 'amber' | 'red';
  onClick?: () => void;
}

function KpiCard({ label, value, subtitle, icon, gradient, onClick }: KpiCardProps) {
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
      <div className="space-y-0.5 sm:space-y-1 pr-7 sm:pr-9">
        <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
        <div className="text-base sm:text-lg font-bold text-gray-900 leading-tight truncate">{value}</div>
        {subtitle && <div className="text-[10px] sm:text-xs text-gray-500 leading-tight truncate">{subtitle}</div>}
      </div>
      {onClick && (
        <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 text-gray-600/40">
          <ChevronRight size={14} />
        </div>
      )}
    </Card>
  );
}

export function ProductionReport({ data, loading, onKpiClick }: ProductionReportProps) {
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
          <ChefHat size={20} />
          <p className="text-sm">No hay datos de producción disponibles.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <h3 className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-2">
        <ChefHat size={16} className="text-primary" />
        Producción
      </h3>

      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        <KpiCard
          label="Recetas Activas"
          value={String(data.activeRecipes)}
          subtitle={`${data.totalRecipes} total`}
          icon={<ChefHat size={14} className="sm:w-4 sm:h-4" />}
          gradient="blue"
          onClick={() => onKpiClick?.('produccionRecetas')}
        />
        <KpiCard
          label="Órdenes"
          value={String(data.totalOrders)}
          subtitle={`${data.completedOrders} completadas`}
          icon={<Package size={14} className="sm:w-4 sm:h-4" />}
          gradient="green"
          onClick={() => onKpiClick?.('produccionOrdenes')}
        />
        <KpiCard
          label="Unidades"
          value={String(data.totalQuantityProduced)}
          icon={<Hash size={14} className="sm:w-4 sm:h-4" />}
          gradient="amber"
          onClick={() => onKpiClick?.('produccionOrdenes')}
        />
        <KpiCard
          label="Merma"
          value={`${data.averageWastePct}%`}
          icon={<AlertTriangle size={14} className="sm:w-4 sm:h-4" />}
          gradient={data.averageWastePct > 10 ? 'red' : 'green'}
        />
        <KpiCard
          label="Costo Ing."
          value={formatUsd(data.totalIngredientCostUsd)}
          icon={<DollarSign size={14} className="sm:w-4 sm:h-4" />}
          gradient="red"
          onClick={() => onKpiClick?.('produccionRecetas')}
        />
        {data.mostProducedRecipe && (
          <KpiCard
            label="Más Producida"
            value={data.mostProducedRecipe}
            subtitle={`${data.mostProducedQuantity} unidades`}
            icon={<TrendingUp size={14} className="sm:w-4 sm:h-4" />}
            gradient="blue"
            onClick={() => onKpiClick?.('produccionRecetas')}
          />
        )}
      </div>
    </div>
  );
}
