import { useChartReady } from '@/hooks/useChartReady';
import { Card } from '@/common/components';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { DailyProfitPoint } from '@/features/reports/types';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface ProfitChartProps {
  data: DailyProfitPoint[];
  loading: boolean;
}

function smartAxisFormat(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value >= 100 ? Math.round(value).toString() : value.toFixed(2);
}

function formatDual(bs: number, usd: number): string {
  return `${formatBs(bs)} / ${formatUsd(usd)}`;
}

export function ProfitChart({ data, loading }: ProfitChartProps) {
  const [ready, containerRef] = useChartReady();

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

  const totalProfit = data.reduce((s, p) => s + p.profitBs, 0);
  const totalProfitUsd = data.reduce((s, p) => s + p.profitUsd, 0);
  const totalSales = data.reduce((s, p) => s + p.salesBs, 0);
  const totalSalesUsd = data.reduce((s, p) => s + p.salesUsd, 0);
  const totalCost = data.reduce((s, p) => s + p.costBs, 0);
  const totalCostUsd = data.reduce((s, p) => s + p.costUsd, 0);
  const totalTransactions = data.reduce((s, p) => s + (p.transactions || 0), 0);

  const firstHalf = data.slice(0, Math.floor(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));
  const firstHalfProfit = firstHalf.reduce((s, p) => s + p.profitBs, 0);
  const secondHalfProfit = secondHalf.reduce((s, p) => s + p.profitBs, 0);
  const trend = firstHalfProfit !== 0 ? ((secondHalfProfit - firstHalfProfit) / Math.abs(firstHalfProfit)) * 100 : 0;

  const chartData = data.map((d) => ({
    ...d,
    label: `${d.label} (Bs ${d.lastRate.toFixed(2)})`,
  }));

  return (
    <Card className="p-4">
      <h3 className="text-sm font-title font-bold text-gray-900 mb-3">Ganancias en el Tiempo</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <div className="p-2 sm:p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-[10px] sm:text-xs text-text-secondary">Ganancia Total</p>
          <p className="text-[10px] sm:text-sm font-bold text-primary truncate">{formatDual(totalProfit, totalProfitUsd)}</p>
        </div>
        <div className="p-2 sm:p-3 rounded-lg bg-primary/3 border border-primary/10">
          <p className="text-[10px] sm:text-xs text-text-secondary">Ventas Totales</p>
          <p className="text-[10px] sm:text-sm font-bold text-primary-dark truncate">{formatDual(totalSales, totalSalesUsd)}</p>
        </div>
        <div className="p-2 sm:p-3 rounded-lg bg-danger/5 border border-danger/20">
          <p className="text-[10px] sm:text-xs text-text-secondary">Gasto Total</p>
          <p className="text-[10px] sm:text-sm font-bold text-danger truncate">{formatDual(totalCost, totalCostUsd)}</p>
        </div>
        <div className="p-2 sm:p-3 rounded-lg bg-accent/5 border border-accent/20">
          <p className="text-[10px] sm:text-xs text-text-secondary">Transacciones</p>
          <p className="text-xs sm:text-base font-bold text-accent-dark truncate">{totalTransactions}</p>
        </div>
      </div>

      {data.length >= 2 && (
        <div className={`flex items-center gap-1.5 p-1.5 sm:p-2 rounded-lg mb-4 text-[10px] sm:text-sm ${trend >= 0 ? 'bg-success/5 text-success' : 'bg-danger/5 text-danger'}`}>
          {trend >= 0 ? <TrendingUp size={12} className="sm:w-4 sm:h-4" /> : <TrendingDown size={12} className="sm:w-4 sm:h-4" />}
          <span className="font-medium">
            {trend >= 0 ? 'Al alza' : 'A la baja'}: {Math.abs(trend).toFixed(1)}%
          </span>
        </div>
      )}

      <div className="h-48 sm:h-64" ref={containerRef}>
        {ready ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0D9488" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="#9ca3af" interval="preserveStartEnd" angle={-15} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={smartAxisFormat} width={60} tickCount={6} />
            <Tooltip
              formatter={(value, name) => [formatBs(Number(value)), name === 'profitBs' ? 'Ganancia' : name === 'salesBs' ? 'Ventas' : 'Costo']}
              labelStyle={{ fontSize: 11 }}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 11 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(value) => (value === 'profitBs' ? 'Ganancia Bruta' : value === 'salesBs' ? 'Ventas' : 'Costo')}
            />
            <Area type="monotone" dataKey="salesBs" stroke="#14B8A6" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />
            <Area type="monotone" dataKey="costBs" stroke="#ef4444" fillOpacity={1} fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
            <Area type="monotone" dataKey="profitBs" stroke="#0D9488" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
        ) : <div className="h-full flex items-center justify-center"><div className="skeleton h-40 w-40 rounded" /></div>}
      </div>
    </Card>
  );
}
