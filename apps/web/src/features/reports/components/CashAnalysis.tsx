import { useState, useMemo } from 'react';
import { Card, Badge } from '@/common/components';
import { TrendingUp, TrendingDown, Minus, DollarSign, Table, LayoutGrid } from 'lucide-react';
import { formatDate } from '../../../lib/formatDate';
import type { CashRegisterSummaryData } from '@/features/reports/types';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface CashAnalysisProps {
  data: CashRegisterSummaryData[];
  loading: boolean;
}

type ViewMode = 'global' | 'byRegister';

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

function GlobalView({ data }: { data: CashRegisterSummaryData[] }) {
  const totals = useMemo(() => {
    const closed = data.filter((r) => r.status === 'closed');
    return {
      totalRegisters: data.length,
      closedRegisters: closed.length,
      openRegisters: data.length - closed.length,
      totalOpeningBs: data.reduce((s, r) => s + r.openingBalanceBs, 0),
      totalOpeningUsd: data.reduce((s, r) => s + r.openingBalanceUsd, 0),
      totalSalesBs: data.reduce((s, r) => s + r.totalSalesBs, 0),
      totalSalesUsd: data.reduce((s, r) => s + (r.totalSalesUsd || 0), 0),
      totalCollectedDebtBs: data.reduce((s, r) => s + (r.collectedDebtBs || 0), 0),
      totalExpectedBs: closed.reduce((s, r) => s + (r.expectedClosingBs ?? 0), 0),
      totalExpectedUsd: closed.reduce((s, r) => s + (r.expectedClosingUsd ?? 0), 0),
      totalDiffBs: closed.reduce((s, r) => s + (r.differenceBs ?? 0), 0),
      totalDiffUsd: closed.reduce((s, r) => s + (r.differenceUsd ?? 0), 0),
      totalSalesCount: data.reduce((s, r) => s + r.totalSalesCount, 0),
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="info">{totals.totalRegisters} {totals.totalRegisters === 1 ? 'caja' : 'cajas'}</Badge>
        {totals.openRegisters > 0 && (
          <Badge variant="success">{totals.openRegisters} abierta{totals.openRegisters !== 1 ? 's' : ''}</Badge>
        )}
        <Badge variant="neutral">{totals.totalSalesCount} transacciones</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="p-3 sm:p-4 space-y-1">
          <p className="text-xs text-gray-700">Apertura Total</p>
          <p className="text-sm font-bold text-gray-900">{formatDual(totals.totalOpeningBs, totals.totalOpeningUsd)}</p>
        </Card>
        <Card className="p-3 sm:p-4 space-y-1">
          <p className="text-xs text-gray-700">Ventas Totales</p>
          <p className="text-sm font-bold text-gray-900">{formatDual(totals.totalSalesBs, totals.totalSalesUsd)}</p>
        </Card>
        {totals.totalCollectedDebtBs > 0 && (
          <Card className="p-3 sm:p-4 space-y-1">
            <p className="text-xs text-gray-700">Cobro de Deudas</p>
            <p className="text-sm font-bold text-success">{formatBs(totals.totalCollectedDebtBs)}</p>
          </Card>
        )}
      </div>

      {totals.closedRegisters > 0 && (
        <Card className="p-3 sm:p-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Consolidado de Cierres</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-2 rounded-lg bg-primary/5">
              <p className="text-xs text-gray-700">Esperado Total</p>
              <p className="text-sm font-semibold text-primary">{formatDual(totals.totalExpectedBs, totals.totalExpectedUsd)}</p>
            </div>
            <div>
              <DiffIndicator differenceBs={totals.totalDiffBs} differenceUsd={totals.totalDiffUsd} />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function ByRegisterView({ data }: { data: CashRegisterSummaryData[] }) {
  return (
    <div className="space-y-3">
      {/* Table: hidden on mobile, visible on md+ */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 font-semibold text-gray-700">Caja</th>
              <th className="text-left py-2 px-2 font-semibold text-gray-700">Operador</th>
              <th className="text-right py-2 px-2 font-semibold text-gray-700">Apertura</th>
              <th className="text-right py-2 px-2 font-semibold text-gray-700">Ventas</th>
              <th className="text-right py-2 px-2 font-semibold text-gray-700">Cobros</th>
              <th className="text-right py-2 px-2 font-semibold text-gray-700">Esperado</th>
              <th className="text-right py-2 px-2 font-semibold text-gray-700">Diferencia</th>
              <th className="text-center py-2 px-2 font-semibold text-gray-700">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.map((reg) => {
              const expected = reg.expectedClosingBs ?? 0;
              const diff = reg.differenceBs;
              const name = reg.registerName || 'Caja';
              return (
                <tr key={reg.registerId} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-2 px-2 font-medium text-gray-900">{name}</td>
                  <td className="py-2 px-2 text-gray-700">{reg.operatorName || '—'}</td>
                  <td className="py-2 px-2 text-right text-gray-900 font-medium">{formatBs(reg.openingBalanceBs)}</td>
                  <td className="py-2 px-2 text-right text-gray-900">{formatDual(reg.totalSalesBs, reg.totalSalesUsd)}</td>
                  <td className="py-2 px-2 text-right text-success">{reg.collectedDebtBs > 0 ? formatBs(reg.collectedDebtBs) : '—'}</td>
                  <td className="py-2 px-2 text-right text-primary font-medium">{expected > 0 ? formatBs(expected) : '—'}</td>
                  <td className="py-2 px-2 text-right">
                    {diff !== undefined && diff !== null ? (
                      <span className={diff === 0 ? 'text-success' : 'text-danger'}>
                        {diff === 0 ? '0' : `${diff > 0 ? '+' : ''}${formatBs(diff)}`}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <Badge variant={reg.status === 'open' ? 'success' : 'neutral'} className="text-[10px] px-1.5 py-0.5">
                      {reg.status === 'open' ? 'Abierta' : 'Cerrada'}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards for mobile */}
      <div className="md:hidden space-y-3">
        {data.map((reg, index) => {
          const expected = reg.expectedClosingBs ?? 0;
          const expectedUsd = reg.expectedClosingUsd ?? 0;
          const opening = reg.openingBalanceBs;
          const sales = reg.totalSalesBs;
          const maxVal = Math.max(opening + sales, expected, 1);
          const openingPct = Math.round((opening / maxVal) * 100);
          const salesPct = Math.round((sales / maxVal) * 100);
          const name = reg.registerName || 'Caja';

          return (
            <Card key={reg.registerId} className="overflow-hidden transition-all duration-200 hover:shadow-md animate-report-stagger" style={{ animationDelay: `${index * 0.05}s` }}>
              <div className="p-3 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-gray-900">
                        <DollarSign size={14} className="inline -mt-0.5 text-primary" />
                        {name}
                      </h4>
                      <Badge variant={reg.status === 'open' ? 'success' : 'neutral'}>
                        {reg.status === 'open' ? 'Abierta' : 'Cerrada'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-700">{reg.operatorName || '—'}</p>
                      {reg.closedAt && (
                        <span className="text-xs text-gray-500">· {formatDate(reg.closedAt)}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 sm:ml-3">
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
                      <div className="h-full bg-primary transition-all duration-500" style={{ width: `${openingPct}%` }} />
                      <div className="h-full bg-primary-light transition-all duration-500" style={{ width: `${salesPct}%` }} />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-xs text-gray-700">
                      <span>Apertura: {formatDual(opening, reg.openingBalanceUsd)}</span>
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
                  {reg.collectedDebtBs > 0 && (
                    <span className="text-success">Cobro deudas: {formatBs(reg.collectedDebtBs)}</span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function CashAnalysis({ data, loading }: CashAnalysisProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('global');

  const tabs = [
    { id: 'global' as ViewMode, label: 'Vista Global', icon: <LayoutGrid size={14} /> },
    { id: 'byRegister' as ViewMode, label: 'Por Caja', icon: <Table size={14} /> },
  ];

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
    <div className="space-y-4">
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {viewMode === 'global' ? (
        <GlobalView data={data} />
      ) : (
        <ByRegisterView data={data} />
      )}
    </div>
  );
}
