import { Card, Badge } from '@/common/components';
import { TrendingUp, TrendingDown, Minus, DollarSign } from 'lucide-react';
import type { CashRegisterSummaryData } from '@/features/reports/types';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface CashAnalysisProps {
  data: CashRegisterSummaryData[];
  loading: boolean;
}

function formatDual(bs: number, usd: number): string {
  return `${formatBs(bs)} / ${formatUsd(usd)}`;
}

function DiffIndicator({ differenceBs, differenceUsd }: { differenceBs: number | null | undefined; differenceUsd: number | null | undefined }) {
  if (differenceBs === undefined || differenceBs === null) {
    return (
      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-gray-50">
        <Minus size={14} className="text-gray-400" />
        <span className="text-sm text-gray-400">Sin cerrar</span>
      </div>
    );
  }

  const isPositive = differenceBs > 0;
  const isZero = differenceBs === 0;

  const bgClass = isZero ? 'bg-gray-50' : isPositive ? 'bg-success/5' : 'bg-danger/5';
  const borderClass = isZero ? 'border-gray-200' : isPositive ? 'border-success/20' : 'border-danger/20';
  const textClass = isZero ? 'text-gray-500' : isPositive ? 'text-success' : 'text-danger';
  const icon = isZero ? <Minus size={14} /> : isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />;

  return (
    <div className={`flex items-center gap-1.5 p-2 rounded-lg border ${bgClass} ${borderClass}`}>
      <span className={textClass}>{icon}</span>
      <div className="flex flex-col">
        <span className={`text-sm font-semibold ${textClass}`}>
          {isZero ? 'Cuadrado' : (isPositive ? '+' : '-')}{formatBs(Math.abs(differenceBs))}
        </span>
        {differenceUsd !== undefined && differenceUsd !== null && (
          <span className={`text-[10px] ${textClass}`}>
            {isZero ? '' : (isPositive ? '+' : '-')}{formatUsd(Math.abs(differenceUsd))}
          </span>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function CashAnalysis({ data, loading }: CashAnalysisProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="space-y-2">
                  <div className="skeleton h-5 w-24 rounded" />
                  <div className="skeleton h-3 w-32 rounded" />
                </div>
                <div className="skeleton h-5 w-20 rounded" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="space-y-1">
                    <div className="skeleton h-3 w-12 rounded" />
                    <div className="skeleton h-4 w-16 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-text-secondary">No hay registros de caja para el periodo seleccionado.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((reg) => {
        const expected = reg.expectedClosingBs ?? 0;
        const expectedUsd = reg.expectedClosingUsd ?? 0;
        const opening = reg.openingBalanceBs;
        const openingUsd = reg.openingBalanceUsd;
        const sales = reg.totalSalesBs;
        const maxVal = Math.max(opening + sales, expected, 1);
        const openingPct = Math.round((opening / maxVal) * 100);
        const salesPct = Math.round((sales / maxVal) * 100);

        return (
          <Card key={reg.registerId} className="overflow-hidden transition-shadow hover:shadow-md">
            <div className="p-3 sm:p-4 space-y-3">
              {/* Header: stacks on mobile, row on desktop */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-gray-900">
                      <DollarSign size={14} className="inline -mt-0.5 text-primary" />
                      Caja &mdash; {formatDate(reg.openedAt)}
                    </h4>
                    <Badge variant={reg.status === 'open' ? 'success' : 'neutral'}>
                      {reg.status === 'open' ? 'Abierta' : 'Cerrada'}
                    </Badge>
                  </div>
                  {reg.closedAt && (
                    <p className="text-xs text-text-secondary mt-1">
                      Cerrada el {formatDate(reg.closedAt)}
                    </p>
                  )}
                </div>
                <div className="text-right sm:text-right shrink-0 sm:ml-3">
                  <p className="text-xs text-text-secondary">Ventas</p>
                  <p className="text-sm font-bold text-gray-900">{formatDual(reg.totalSalesBs, reg.totalSalesUsd)}</p>
                </div>
              </div>

              {reg.closedAt && expected > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Apertura + Ventas</span>
                    <span>Esperado</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-blue-400 transition-all duration-500"
                      style={{ width: `${openingPct}%` }}
                    />
                    <div
                      className="h-full bg-emerald-400 transition-all duration-500"
                      style={{ width: `${salesPct}%` }}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-[11px] text-text-secondary">
                    <span>Apertura: {formatDual(opening, openingUsd)}</span>
                    <span>Esperado: {formatDual(expected, expectedUsd)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-blue-50">
                  <p className="text-text-secondary">Apertura</p>
                  <p className="font-semibold text-blue-700">{formatDual(reg.openingBalanceBs, reg.openingBalanceUsd)}</p>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50">
                  <p className="text-text-secondary">Esperado</p>
                  <p className="font-semibold text-emerald-700">
                    {reg.expectedClosingBs !== undefined ? formatDual(reg.expectedClosingBs, reg.expectedClosingUsd ?? 0) : '-'}
                  </p>
                </div>
                <div>
                  <DiffIndicator differenceBs={reg.differenceBs} differenceUsd={reg.differenceUsd} />
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-text-secondary pt-1 border-t border-gray-100">
                <span>{reg.totalSalesCount} transacciones</span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
