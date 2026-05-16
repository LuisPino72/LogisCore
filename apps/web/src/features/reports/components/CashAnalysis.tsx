import { Card, Badge } from '@/common/components';
import { TrendingUp, TrendingDown, Minus, DollarSign } from 'lucide-react';
import type { CashRegisterSummaryData } from '@/features/reports/types';

interface CashAnalysisProps {
  data: CashRegisterSummaryData[];
  loading: boolean;
}

function DiffIndicator({ differenceBs }: { differenceBs: number | null | undefined }) {
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
      <span className={`text-sm font-semibold ${textClass}`}>
        {isZero ? 'Cuadrado' : (isPositive ? '+' : '-')}{formatBs(Math.abs(differenceBs))}
      </span>
    </div>
  );
}

function formatBs(v: number) {
  return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(v);
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
        const opening = reg.openingBalanceBs;
        const sales = reg.totalSalesBs;
        const maxVal = Math.max(opening + sales, expected, 1);
        const openingPct = Math.round((opening / maxVal) * 100);
        const salesPct = Math.round((sales / maxVal) * 100);

        return (
          <Card key={reg.registerId} className="overflow-hidden transition-shadow hover:shadow-md">
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-gray-900">
                      <DollarSign size={14} className="inline -mt-0.5 text-primary" />
                      Caja #{reg.registerId.slice(0, 8)}
                    </h4>
                    <Badge variant={reg.status === 'open' ? 'success' : 'neutral'}>
                      {reg.status === 'open' ? 'Abierta' : 'Cerrada'}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    {formatDate(reg.openedAt)}
                    {reg.closedAt && ` → ${formatDate(reg.closedAt)}`}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-xs text-text-secondary">Ventas</p>
                  <p className="text-base font-bold text-gray-900">{formatBs(reg.totalSalesBs)}</p>
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
                  <div className="flex justify-between text-[11px] text-text-secondary">
                    <span>Apertura: {formatBs(opening)}</span>
                    <span>Esperado: {formatBs(expected)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-2 rounded-lg bg-blue-50">
                  <p className="text-text-secondary">Apertura</p>
                  <p className="font-semibold text-blue-700">{formatBs(reg.openingBalanceBs)}</p>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50">
                  <p className="text-text-secondary">Esperado</p>
                  <p className="font-semibold text-emerald-700">
                    {reg.expectedClosingBs !== undefined ? formatBs(reg.expectedClosingBs) : '-'}
                  </p>
                </div>
                <div>
                  <DiffIndicator differenceBs={reg.differenceBs} />
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-text-secondary pt-1 border-t border-gray-100">
                <span>{reg.totalSalesCount} transacciones</span>
                <span>IGTF {formatBs(reg.totalIgtfBs)}</span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
