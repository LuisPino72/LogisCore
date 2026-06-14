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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <DollarSign size={16} className="text-primary" />
          </div>
          <span className="text-xs text-text-secondary font-medium">Total del mes</span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-primary">{formatUsd(summary.total)}</p>
        <p className="text-[10px] text-text-secondary mt-0.5">{gastos.length} gasto(s)</p>
      </Card>

      <Card className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
            <Clock size={16} className="text-warning" />
          </div>
          <span className="text-xs text-text-secondary font-medium">Pendientes</span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-warning">{summary.pendingCount}</p>
        <p className="text-[10px] text-text-secondary mt-0.5">{formatUsd(summary.pendingTotal)}</p>
      </Card>

      <Card className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
            <CheckCircle size={16} className="text-success" />
          </div>
          <span className="text-xs text-text-secondary font-medium">Pagados</span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-success">{summary.paidCount}</p>
        <p className="text-[10px] text-text-secondary mt-0.5">{formatUsd(summary.paidTotal)}</p>
      </Card>

      <Card className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <TrendingUp size={16} className="text-accent" />
          </div>
          <span className="text-xs text-text-secondary font-medium">Categoría top</span>
        </div>
        <p className="text-sm font-bold text-gray-900 truncate">{summary.topCategory ? getExpenseCategoryLabel(summary.topCategory) : '—'}</p>
        <p className="text-[10px] text-text-secondary mt-0.5">{summary.topAmount > 0 ? formatUsd(summary.topAmount) : '—'}</p>
      </Card>
    </div>
  );
}
