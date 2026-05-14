import { Card } from '@/common/components';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { DailyProfitPoint } from '@/features/reports/types';

interface ProfitChartProps {
  data: DailyProfitPoint[];
  loading: boolean;
}

export function ProfitChart({ data, loading }: ProfitChartProps) {
  if (loading) {
    return <Card className="p-4 h-72 animate-pulse bg-gray-100"><div /></Card>;
  }

  if (data.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-500">No hay datos de ganancias para el periodo seleccionado.</p>
      </Card>
    );
  }

  const formatBs = (v: number) =>
    new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', maximumFractionDigits: 0 }).format(v);

  return (
    <Card className="p-4">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Ganancias en el Tiempo</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={(v) => formatBs(v)} width={80} />
            <Tooltip
              formatter={(value, name) => [formatBs(Number(value)), name === 'profitBs' ? 'Ganancia' : name === 'salesBs' ? 'Ventas' : 'Costo']}
              labelStyle={{ fontSize: 12, color: '#374151' }}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) => (value === 'profitBs' ? 'Ganancia Bruta' : value === 'salesBs' ? 'Ventas' : 'Costo')}
            />
            <Area type="monotone" dataKey="salesBs" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />
            <Area type="monotone" dataKey="costBs" stroke="#ef4444" fillOpacity={1} fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
            <Area type="monotone" dataKey="profitBs" stroke="#10b981" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
