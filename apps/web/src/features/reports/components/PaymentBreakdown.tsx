import { useEffect, useState } from 'react';
import { Card } from '@/common/components';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { PaymentBreakdownData } from '@/features/reports/types';
import { formatBs } from '@/lib/formatBs';

interface PaymentBreakdownProps {
  data: PaymentBreakdownData[];
  loading: boolean;
}

export function PaymentBreakdown({ data, loading }: PaymentBreakdownProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton h-48 rounded-lg" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-6 rounded" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-text-secondary">No hay datos de pagos para el periodo seleccionado.</p>
      </Card>
    );
  }

  const colors: Record<string, string> = {
    efectivo_bs: '#10b981',
    pago_movil: '#3b82f6',
    tarjeta_bs: '#8b5cf6',
    efectivo_usd: '#f59e0b',
  };

  const totalBs = data.reduce((s, d) => s + d.totalBs, 0);

  const CustomCenterLabel = () => (
    <text
      x="50%"
      y="50%"
      textAnchor="middle"
      dominantBaseline="central"
    >
      <tspan x="50%" dy="-0.4em" className="fill-gray-400" style={{ fontSize: 11 }}>Total</tspan>
      <tspan x="50%" dy="1.3em" className="fill-gray-900" style={{ fontSize: 14, fontWeight: 700 }}>
        {totalBs >= 1000 ? `${(totalBs / 1000).toFixed(1)}K` : totalBs.toFixed(0)}
      </tspan>
      <tspan x="50%" dy="1.2em" className="fill-gray-400" style={{ fontSize: 9 }}>Bs</tspan>
    </text>
  );

  return (
    <Card className="p-4">
      <h3 className="text-sm font-title font-bold text-gray-900 mb-4">Métodos de Pago</h3>
      <div className="h-48">
        {mounted ? (
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
            <CustomCenterLabel />
          </PieChart>
        </ResponsiveContainer>
        ) : <div className="h-full flex items-center justify-center"><div className="skeleton h-40 w-40 rounded-full" /></div>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {data.map((d) => (
          <div key={d.method} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-gray-50">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: colors[d.method] ?? '#9ca3af' }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-gray-600 truncate">{d.label}</p>
              <p className="text-[11px] text-text-secondary">{formatBs(d.totalBs)}</p>
            </div>
            <span className="font-semibold text-gray-900 shrink-0">{d.percentage}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
