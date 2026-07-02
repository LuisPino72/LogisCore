import { useState, useCallback } from 'react';
import { reportsService } from '../services/reportsService';
import type { ReportFilters, DrillDownType } from '../types';

export function useDrillDown(tenantId: string | null, filters: ReportFilters) {
  const [activeDrillDown, setActiveDrillDown] = useState<DrillDownType | null>(null);
  const [drillDownData, setDrillDownData] = useState<Record<string, unknown>[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  const openDrillDown = useCallback(async (type: DrillDownType) => {
    if (!tenantId) return;
    setActiveDrillDown(type);
    setDrillDownLoading(true);
    try {
      let result;
      if (type === 'ventas') {
        result = await reportsService.getSalesDetail(tenantId, filters);
      } else if (type === 'ganancia' || type === 'topProducto') {
        result = await reportsService.getTopProducts(tenantId, filters, 50);
      } else if (type === 'gastos') {
        result = await reportsService.getExpenseBreakdown(tenantId, filters);
      } else if (type === 'ticket') {
        result = await reportsService.getTicketDistribution(tenantId, filters);
      } else if (type === 'descuentos') {
        result = await reportsService.getDiscountBreakdown(tenantId, filters);
      } else if (type === 'topClientes' || type === 'clientesRanking') {
        result = await reportsService.getCustomersRanking(tenantId, filters);
      } else if (type === 'produccionRecetas') {
        result = await reportsService.getRecipeProfitability(tenantId, filters);
      } else if (type === 'pendientePorCobrar') {
        result = await reportsService.getPendingCreditDetail(tenantId);
      } else if (type === 'cuentasPorPagar') {
        const payablesData = await reportsService.getPayablesDetail(tenantId);
        result = { ok: true as const, data: payablesData };
      } else if (type === 'produccionOrdenes') {
        const orderResult = await reportsService.getProductionSummary(tenantId, filters);
        if (orderResult.ok) {
          result = { ok: true as const, data: [orderResult.data] };
        }
      } else if (type === 'produccionUnidades' || type === 'produccionMerma' || type === 'produccionCostoIng') {
        result = await reportsService.getRecipeProfitability(tenantId, filters);
      }
      if (result?.ok) setDrillDownData(result.data as unknown as Record<string, unknown>[]);
    } finally {
      setDrillDownLoading(false);
    }
  }, [tenantId, filters]);

  const closeDrillDown = useCallback(() => {
    setActiveDrillDown(null);
    setDrillDownData([]);
  }, []);

  return { activeDrillDown, drillDownData, drillDownLoading, openDrillDown, closeDrillDown };
}
