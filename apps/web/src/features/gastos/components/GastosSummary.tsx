import { useMemo } from 'react';
import { DollarSign, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import { Card } from '@/common/components';
import { formatUsd } from '@/lib/formatBs';
import { getExpenseCategoryLabel } from '../types';
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

    const categoryTotals = new Map<string, number>();
    for (const g of gastos) {
      categoryTotals.set(g.category, (categoryTotals.get(g.category) ?? 0) + g.amountUsd);
    }
    let topCategory = '';
    let topAmount = 0;
    for (const [cat, amt] of categoryTotals) {
      if (amt > topAmount) {
        topCategory = cat;
        topAmount = amt;
      }
    }

    return {
      total,
      pendingCount: pending.length,
      pendingTotal,
      paidCount: paid.length,
      paidTotal,
      topCategory,
      topAmount,
    };
  }, [gastos]);

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      <Card className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <DollarSign size={14} className="text-primary sm:hidden" />
            <DollarSign size={16} className="text-primary hidden sm:block" />
          </div>
          <span className="text-[11px] sm:text-xs text-text-secondary font-medium leading-tight">Total del mes</span>
        </div>
        <p className="text-base sm:text-xl font-bold text-primary leading-tight">{formatUsd(summary.total)}</p>
        <p className="text-[11px] sm:text-xs text-text-secondary mt-1">{gastos.length} gasto{gastos.length !== 1 ? 's' : ''}</p>
      </Card>

      <Card className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
            <Clock size={14} className="text-warning sm:hidden" />
            <Clock size={16} className="text-warning hidden sm:block" />
          </div>
          <span className="text-[11px] sm:text-xs text-text-secondary font-medium leading-tight">Pendientes</span>
        </div>
        <p className="text-base sm:text-xl font-bold text-warning leading-tight">{summary.pendingCount}</p>
        <p className="text-[11px] sm:text-xs text-text-secondary mt-1">{formatUsd(summary.pendingTotal)}</p>
      </Card>

      <Card className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
            <CheckCircle size={14} className="text-success sm:hidden" />
            <CheckCircle size={16} className="text-success hidden sm:block" />
          </div>
          <span className="text-[11px] sm:text-xs text-text-secondary font-medium leading-tight">Pagados</span>
        </div>
        <p className="text-base sm:text-xl font-bold text-success leading-tight">{summary.paidCount}</p>
        <p className="text-[11px] sm:text-xs text-text-secondary mt-1">{formatUsd(summary.paidTotal)}</p>
      </Card>

      <Card className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <TrendingUp size={14} className="text-accent sm:hidden" />
            <TrendingUp size={16} className="text-accent hidden sm:block" />
          </div>
          <span className="text-[11px] sm:text-xs text-text-secondary font-medium leading-tight">Categoría top</span>
        </div>
        <p className="text-sm sm:text-base font-bold text-gray-900 truncate leading-tight">{summary.topCategory ? getExpenseCategoryLabel(summary.topCategory) : 'Sin datos'}</p>
        <p className="text-[11px] sm:text-xs text-text-secondary mt-1">{summary.topAmount > 0 ? formatUsd(summary.topAmount) : '—'}</p>
      </Card>
    </div>
  );
}
