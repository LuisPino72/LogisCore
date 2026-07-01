import { useChartReady } from '@/hooks/useChartReady';
import { Card } from '@/common/components';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { ExpenseBreakdownItem } from '@/features/reports/types';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { EXPENSE_CATEGORY_COLORS } from '../chartTokens';
import { ChartCenterLabel } from '@/common/components';

interface ExpenseBreakdownChartProps {
  data: ExpenseBreakdownItem[];
  loading: boolean;
}

export function ExpenseBreakdownChart({ data, loading }: ExpenseBreakdownChartProps) {
  const [ready, containerRef] = useChartReady();

  if (loading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton h-48 rounded-lg" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-14 sm:h-6 rounded" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-600">Aún no hay gastos registrados para este período.</p>
      </Card>
    );
  }

  const totalBs = data.reduce((s, d) => s + d.amountBs, 0);
  const totalUsd = data.reduce((s, d) => s + d.amountUsd, 0);

  const chartData = data
    .filter((d) => d.amountBs > 0)
    .sort((a, b) => b.amountBs - a.amountBs);

  return (
    <Card className="p-4 animate-report-chart-reveal">
      <h3 className="text-sm font-title font-bold text-gray-900 mb-1">Desglose de Gastos</h3>
      <p className="text-xs text-gray-700 mb-4">{formatBs(totalBs)} / {formatUsd(totalUsd)}</p>
      <div className="h-48 overflow-hidden" ref={containerRef}>
        {ready ? (
        <ResponsiveContainer width="100%" height="100%" key="chart-ready">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amountBs"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={65}
              innerRadius={38}
              stroke="#fff"
              strokeWidth={2}
            >
              {chartData.map((entry) => (
                <Cell key={entry.label} fill={EXPENSE_CATEGORY_COLORS[entry.label] ?? '#9ca3af'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatBs(Number(value)), name]}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            />
            <ChartCenterLabel totalBs={totalBs} />
          </PieChart>
        </ResponsiveContainer>
        ) : <div className="h-48 flex items-center justify-center"><div className="skeleton h-40 w-40 rounded-full" /></div>}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {chartData.map((d) => {
          const pct = totalBs > 0 ? ((d.amountBs / totalBs) * 100).toFixed(1) : '0';
          return (
            <div key={d.label} className="flex items-center gap-2 text-xs p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: EXPENSE_CATEGORY_COLORS[d.label] ?? '#9ca3af' }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-700 wrap-break-word">{d.label}</p>
                <p className="text-xs text-gray-700">{formatBs(d.amountBs)}</p>
                <p className="text-xs text-gray-700">{formatUsd(d.amountUsd)}</p>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="font-semibold text-gray-900">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
