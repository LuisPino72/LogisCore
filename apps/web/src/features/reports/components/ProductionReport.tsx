import { Card, Spinner, EmptyState, KpiCard } from '@/common/components';
import { ChefHat, Package, AlertTriangle, TrendingUp, Hash, DollarSign } from 'lucide-react';
import type { ProductionSummaryData, DrillDownType } from '@/features/reports/types';
import { formatUsd } from '@/lib/formatBs';

interface ProductionReportProps {
  data: ProductionSummaryData | null;
  loading: boolean;
  onKpiClick?: (type: DrillDownType) => void;
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
        <EmptyState
          icon={<ChefHat size={20} />}
          title="No hay datos de producción disponibles"
          description="Crea recetas u órdenes de producción para ver el reporte."
        />
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
          animationDelay={0}
        />
        <KpiCard
          label="Órdenes"
          value={String(data.totalOrders)}
          subtitle={`${data.completedOrders} completadas`}
          icon={<Package size={14} className="sm:w-4 sm:h-4" />}
          gradient="green"
          onClick={() => onKpiClick?.('produccionOrdenes')}
          animationDelay={0.05}
        />
        <KpiCard
          label="Unidades"
          value={String(data.totalQuantityProduced)}
          icon={<Hash size={14} className="sm:w-4 sm:h-4" />}
          gradient="amber"
          onClick={() => onKpiClick?.('produccionOrdenes')}
          animationDelay={0.1}
        />
        <KpiCard
          label="Merma"
          value={`${data.averageWastePct}%`}
          icon={<AlertTriangle size={14} className="sm:w-4 sm:h-4" />}
          gradient={data.averageWastePct > 10 ? 'red' : 'green'}
          animationDelay={0.15}
        />
        <KpiCard
          label="Costo Ing."
          value={formatUsd(data.totalIngredientCostUsd)}
          icon={<DollarSign size={14} className="sm:w-4 sm:h-4" />}
          gradient="red"
          onClick={() => onKpiClick?.('produccionRecetas')}
          animationDelay={0.2}
        />
        {data.mostProducedRecipe && (
          <KpiCard
            label="Más Producida"
            value={data.mostProducedRecipe}
            subtitle={`${data.mostProducedQuantity} unidades`}
            icon={<TrendingUp size={14} className="sm:w-4 sm:h-4" />}
            gradient="blue"
            onClick={() => onKpiClick?.('produccionRecetas')}
            animationDelay={0.25}
          />
        )}
      </div>
    </div>
  );
}
