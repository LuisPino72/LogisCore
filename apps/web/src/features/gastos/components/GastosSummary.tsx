import { useMemo } from 'react';
import { DollarSign } from 'lucide-react';
import { Card } from '@/common/components';
import { formatUsd } from '@/lib/formatBs';
import type { Gasto } from '../types';

interface GastosSummaryProps {
  gastos: Gasto[];
}

export function GastosSummary({ gastos }: GastosSummaryProps) {
  const summary = useMemo(() => {
    const total = gastos.reduce((sum, g) => sum + g.amountUsd, 0);
    const pending = gastos.filter((g) => g.status === 'pending');
    const paid = gastos.filter((g) => g.status === 'paid');

    const pendingTotal = pending.reduce((sum, g) => sum + g.amountUsd, 0);
    const paidTotal = paid.reduce((sum, g) => sum + g.amountUsd, 0);

    return {
      total,
      pendingCount: pending.length,
      pendingTotal,
      paidCount: paid.length,
      paidTotal,
    };
  }, [gastos]);

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <DollarSign size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-text-secondary font-medium">Gastos del mes</p>
            <p className="text-lg sm:text-xl font-bold text-primary leading-tight">{formatUsd(summary.total)}</p>
            <p className="text-xs text-text-secondary">{gastos.length} gasto{gastos.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:pl-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning shrink-0" />
            <div>
              <p className="text-xs text-text-secondary">Pendientes</p>
              <p className="text-sm sm:text-base font-semibold text-gray-900">{formatUsd(summary.pendingTotal)}<span className="text-text-secondary font-normal ml-1">· {summary.pendingCount}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success shrink-0" />
            <div>
              <p className="text-xs text-text-secondary">Pagados</p>
              <p className="text-sm sm:text-base font-semibold text-gray-900">{formatUsd(summary.paidTotal)}<span className="text-text-secondary font-normal ml-1">· {summary.paidCount}</span></p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
