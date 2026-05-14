import { Card, Badge } from '@/common/components';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { CashRegisterSummaryData } from '@/features/reports/types';

interface CashAnalysisProps {
  data: CashRegisterSummaryData[];
  loading: boolean;
}

export function CashAnalysis({ data, loading }: CashAnalysisProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4 h-24 animate-pulse bg-gray-100"><div /></Card>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-500">No hay registros de caja para el periodo seleccionado.</p>
      </Card>
    );
  }

  const formatBs = (v: number) =>
    new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(v);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: '2-digit' });

  return (
    <div className="space-y-3">
      {data.map((reg) => (
        <Card key={reg.registerId} className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-gray-900">Caja #{reg.registerId.slice(0, 8)}</h4>
                <Badge variant={reg.status === 'open' ? 'success' : 'neutral'}>
                  {reg.status === 'open' ? 'Abierta' : 'Cerrada'}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatDate(reg.openedAt)} {reg.closedAt && `→ ${formatDate(reg.closedAt)}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Ventas</p>
              <p className="text-sm font-bold text-gray-900">{formatBs(reg.totalSalesBs)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-gray-500">Apertura</p>
              <p className="font-semibold text-gray-800">{formatBs(reg.openingBalanceBs)}</p>
            </div>
            <div>
              <p className="text-gray-500">Esperado</p>
              <p className="font-semibold text-gray-800">{reg.expectedClosingBs !== undefined ? formatBs(reg.expectedClosingBs) : '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">Diferencia</p>
              <div className="flex items-center gap-1">
                {reg.differenceBs === undefined || reg.differenceBs === null ? (
                  <Minus size={12} className="text-gray-400" />
                ) : reg.differenceBs > 0 ? (
                  <TrendingUp size={12} className="text-success" />
                ) : reg.differenceBs < 0 ? (
                  <TrendingDown size={12} className="text-danger" />
                ) : (
                  <Minus size={12} className="text-gray-400" />
                )}
                <span
                  className={`font-semibold ${
                    reg.differenceBs === undefined || reg.differenceBs === null
                      ? 'text-gray-400'
                      : reg.differenceBs > 0
                      ? 'text-success'
                      : reg.differenceBs < 0
                      ? 'text-danger'
                      : 'text-gray-600'
                  }`}
                >
                  {reg.differenceBs !== undefined && reg.differenceBs !== null ? formatBs(Math.abs(reg.differenceBs)) : '-'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span>{reg.totalSalesCount} transacciones</span>
            <span>IGTF {formatBs(reg.totalIgtfBs)}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
