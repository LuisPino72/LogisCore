import { useChartReady } from '@/hooks/useChartReady';
import { Card } from '@/common/components';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { TopProductData } from '@/features/reports/types';
import { formatBs } from '@/lib/formatBs';

interface TopProductsChartProps {
  data: TopProductData[];
  loading: boolean;
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32'];
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1'];

export function TopProductsChart({ data, loading }: TopProductsChartProps) {
  const [ready, containerRef] = useChartReady();

  if (loading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          <div className="skeleton h-5 w-48 rounded" />
          <div className="skeleton h-48 sm:h-64 rounded-lg" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-8 rounded" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-text-secondary">No hay datos de productos para el periodo seleccionado.</p>
      </Card>
    );
  }

  const topProfit = data[0]?.profitBs ?? 1;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-title font-bold text-gray-900 mb-4">Top Productos por Ganancia</h3>

      <div className="-mx-4 sm:mx-0 h-48 sm:h-64" ref={containerRef}>
        {ready ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9 }} stroke="#9ca3af" tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : `${v}`} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} stroke="#9ca3af" width={45} />
            <Tooltip
              formatter={(value) => [formatBs(Number(value)), 'Ganancia']}
              labelStyle={{ fontSize: 11 }}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 11 }}
            />
            <Bar dataKey="profitBs" radius={[0, 4, 4, 0]}>
              {data.slice(0, 10).map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        ) : <div className="h-48 sm:h-64 flex items-center justify-center"><div className="skeleton h-40 w-40 rounded" /></div>}
      </div>

      <div className="mt-3 sm:mt-4 space-y-1.5 sm:space-y-2">
        {data.map((p, index) => {
          const pct = topProfit > 0 ? Math.round((p.profitBs / topProfit) * 100) : 0;
          const isTop3 = index < 3;

          return (
            <div key={p.productId} className="group">
              <div className="flex items-center justify-between text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
                  {isTop3 && (
                    <span
                      className="w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: RANK_COLORS[index] }}
                    >
                      {index + 1}
                    </span>
                  )}
                  <span className="font-medium text-gray-700 truncate">{p.name}</span>
                  <span className="text-text-secondary shrink-0 text-[9px] sm:text-[11px]">
                    {p.quantitySold.toFixed(p.quantitySold % 1 !== 0 ? 2 : 0)} u
                  </span>
                </div>
                <div className="flex items-center gap-1 sm:gap-3 shrink-0 ml-1 sm:ml-2">
                  <span className="text-text-secondary text-[9px] sm:text-xs">{formatBs(p.revenueBs)}</span>
                  <span className={`font-semibold text-[10px] sm:text-xs ${p.profitBs >= 0 ? 'text-success' : 'text-danger'}`}>
                    {formatBs(p.profitBs)}
                  </span>
                </div>
              </div>
              <div className="h-1 sm:h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1 sm:mb-2">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: p.profitBs >= 0 ? CHART_COLORS[index % CHART_COLORS.length] : '#ef4444',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
