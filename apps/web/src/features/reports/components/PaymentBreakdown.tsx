import { Card } from '@/common/components';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { PaymentBreakdownData } from '@/features/reports/types';

interface PaymentBreakdownProps {
  data: PaymentBreakdownData[];
  loading: boolean;
}

export function PaymentBreakdown({ data, loading }: PaymentBreakdownProps) {
  if (loading) {
    return <Card className="p-4 h-72 animate-pulse bg-gray-100"><div /></Card>;
  }

  if (data.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-500">No hay datos de pagos para el periodo seleccionado.</p>
      </Card>
    );
  }

  const colors: Record<string, string> = {
    efectivo_bs: '#10b981',
    pago_movil: '#3b82f6',
    tarjeta_bs: '#8b5cf6',
    efectivo_usd: '#f59e0b',
  };

  const formatBs = (v: number) =>
    new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', maximumFractionDigits: 0 }).format(v);

  return (
    <Card className="p-4">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Métodos de Pago</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="totalBs"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={70}
              innerRadius={40}
              stroke="#fff"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.method} fill={colors[entry.method] ?? '#9ca3af'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatBs(Number(value)), name]}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {data.map((d) => (
          <div key={d.method} className="flex items-center gap-2 text-xs">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: colors[d.method] ?? '#9ca3af' }}
            />
            <span className="text-gray-600 truncate">{d.label}</span>
            <span className="ml-auto font-semibold text-gray-900">{d.percentage}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
