import { Card, Badge } from '@/common/components';
import { TrendingUp, TrendingDown, Minus, DollarSign } from 'lucide-react';
import { formatDate } from '../../../lib/formatDate';
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
        <Minus size={14} className="text-gray-600" />
        <span className="text-sm text-gray-600">Sin cerrar</span>
      </div>
    );
  }

  const isZero = differenceBs === 0;
  const isPositive = differenceBs > 0;

  if (isZero) {
    return (
      <div className="flex items-center gap-1.5 p-2 rounded-lg border border-success/20 bg-success/5">
        <Minus size={14} className="text-success" />
        <span className="text-sm font-semibold text-success">Ajustado</span>
      </div>
    );
  }

  const icon = isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />;

  return (
    <div className="flex items-start gap-1.5 p-2 rounded-lg border border-danger/20 bg-danger/5">
      <span className="text-danger mt-0.5">{icon}</span>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-danger">Desajuste</span>
        <span className="text-xs text-danger">
          {(isPositive ? '+' : '-')}{formatBs(Math.abs(differenceBs))}
        </span>
        {differenceUsd !== undefined && differenceUsd !== null && (
          <span className="text-xs text-danger">
            {(isPositive ? '+' : '-')}{formatUsd(Math.abs(differenceUsd))}
          </span>
        )}
      </div>
    </div>
  );
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
        <p className="text-sm text-gray-700">Aún no hay registros de caja. Abre una caja para comenzar a registrar.</p>
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
                    <p className="text-xs text-gray-700 mt-1">
                      Cerrada el {formatDate(reg.closedAt)}
                    </p>
                  )}
                </div>
                <div className="text-right sm:text-right shrink-0 sm:ml-3">
                  <p className="text-xs text-gray-700">Ventas</p>
                  <p className="text-sm font-bold text-gray-900">{formatDual(reg.totalSalesBs, reg.totalSalesUsd)}</p>
                </div>
              </div>

              {reg.closedAt && expected > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-700">
                    <span>Apertura + Ventas</span>
                    <span>Esperado</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${openingPct}%` }}
                    />
                    <div
                      className="h-full bg-primary-light transition-all duration-500"
                      style={{ width: `${salesPct}%` }}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-xs text-gray-700">
                    <span>Apertura: {formatDual(opening, openingUsd)}</span>
                    <span>Esperado: {formatDual(expected, expectedUsd)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-primary/5">
                  <p className="text-gray-700">Apertura</p>
                  <p className="font-semibold text-primary">{formatDual(reg.openingBalanceBs, reg.openingBalanceUsd)}</p>
                </div>
                <div className="p-2 rounded-lg bg-primary/10">
                  <p className="text-gray-700">Esperado</p>
                  <p className="font-semibold text-primary-dark">
                    {reg.expectedClosingBs !== undefined ? formatDual(reg.expectedClosingBs, reg.expectedClosingUsd ?? 0) : '-'}
                  </p>
                </div>
                <div>
                  <DiffIndicator differenceBs={reg.differenceBs} differenceUsd={reg.differenceUsd} />
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-700 pt-1 border-t border-gray-100">
                <span>{reg.totalSalesCount} transacciones</span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

