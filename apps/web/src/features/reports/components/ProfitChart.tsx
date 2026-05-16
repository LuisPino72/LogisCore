import { Card } from '@/common/components';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { DailyProfitPoint } from '@/features/reports/types';

interface ProfitChartProps {
  data: DailyProfitPoint[];
  loading: boolean;
}

export function ProfitChart({ data, loading }: ProfitChartProps) {
  if (loading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          <div className="skeleton h-5 w-48 rounded" />
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-48 sm:h-64 rounded-lg" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-text-secondary">No hay datos de ganancias para el periodo seleccionado.</p>
      </Card>
    );
  }

  const formatBs = (v: number) =>
    new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', maximumFractionDigits: 0 }).format(v);

  const totalProfit = data.reduce((s, p) => s + p.profitBs, 0);
  const totalSales = data.reduce((s, p) => s + p.salesBs, 0);
  const totalCost = data.reduce((s, p) => s + p.costBs, 0);
  const totalTransactions = data.reduce((s, p) => s + (p.transactions || 0), 0);

  const firstHalf = data.slice(0, Math.floor(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));
  const firstHalfProfit = firstHalf.reduce((s, p) => s + p.profitBs, 0);
  const secondHalfProfit = secondHalf.reduce((s, p) => s + p.profitBs, 0);
  const trend = firstHalfProfit !== 0 ? ((secondHalfProfit - firstHalfProfit) / Math.abs(firstHalfProfit)) * 100 : 0;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-title font-bold text-gray-900 mb-3">Ganancias en el Tiempo</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200/60">
          <p className="text-xs text-text-secondary">Ganancia Total</p>
          <p className="text-base font-bold text-emerald-700">{formatBs(totalProfit)}</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200/60">
          <p className="text-xs text-text-secondary">Ventas Totales</p>
          <p className="text-base font-bold text-blue-700">{formatBs(totalSales)}</p>
        </div>
        <div className="p-3 rounded-lg bg-red-50 border border-red-200/60">
          <p className="text-xs text-text-secondary">Costo Total</p>
          <p className="text-base font-bold text-red-700">{formatBs(totalCost)}</p>
        </div>
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200/60">
          <p className="text-xs text-text-secondary">Transacciones</p>
          <p className="text-base font-bold text-amber-700">{totalTransactions}</p>
        </div>
      </div>

      {data.length >= 2 && (
        <div className={`flex items-center gap-2 p-2 rounded-lg mb-4 text-sm ${trend >= 0 ? 'bg-success/5 text-success' : 'bg-danger/5 text-danger'}`}>
          {trend >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span className="font-medium">
            {trend >= 0 ? 'Tendencia al alza' : 'Tendencia a la baja'}: {Math.abs(trend).toFixed(1)}% entre primera y segunda mitad del periodo
          </span>
        </div>
      )}

      <div className="h-48 sm:h-64">
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
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => formatBs(v)} width={70} />
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
