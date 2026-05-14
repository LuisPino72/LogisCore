import { Card } from '@/common/components';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { TopProductData } from '@/features/reports/types';

interface TopProductsChartProps {
  data: TopProductData[];
  loading: boolean;
}

export function TopProductsChart({ data, loading }: TopProductsChartProps) {
  if (loading) {
    return <Card className="p-4 h-72 animate-pulse bg-gray-100"><div /></Card>;
  }

  if (data.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-500">No hay datos de productos para el periodo seleccionado.</p>
      </Card>
    );
  }

  const formatBs = (v: number) =>
    new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', maximumFractionDigits: 0 }).format(v);

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1'];

  return (
    <Card className="p-4">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Top Productos por Ganancia</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 5, left: 40, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={(v) => formatBs(v)} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="#9ca3af" width={100} />
            <Tooltip
              formatter={(value) => [formatBs(Number(value)), 'Ganancia']}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            />
            <Bar dataKey="profitBs" radius={[0, 4, 4, 0]}>
              {data.slice(0, 10).map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
        {data.map((p) => (
          <div key={p.productId} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-gray-700 truncate">{p.name}</span>
              <span className="text-gray-400 shrink-0">{p.quantitySold.toFixed(p.quantitySold % 1 !== 0 ? 2 : 0)} u</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-gray-500">{formatBs(p.revenueBs)}</span>
              <span className={`font-semibold ${p.profitBs >= 0 ? 'text-success' : 'text-danger'}`}>{formatBs(p.profitBs)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
