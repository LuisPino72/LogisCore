import { useMemo, useState } from 'react';
import { Calendar, TrendingUp } from 'lucide-react';
import { Button, EmptyState, SearchInput, DatePicker, SaleDetailModal } from '../../../common/components';
import type { Customer } from '../../../specs/customers';
import type { Sale } from '../../pos/types';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface GlobalHistoryViewProps {
  tenantId: string | null;
  startDate: string;
  endDate: string;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  sales: Sale[];
  loading: boolean;
  customers: Customer[];
  ranking: Array<{ customerId: string; customerName: string; totalSpentUsd: number; totalSpentBs: number; purchaseCount: number; averageTicketUsd: number }>;
  rankingLoading: boolean;
}

export function GlobalHistoryView({
  tenantId,
  startDate, endDate, setStartDate, setEndDate,
  searchQuery, setSearchQuery, sales, loading, customers,
  ranking, rankingLoading,
}: GlobalHistoryViewProps) {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const filteredSales = useMemo(() => {
    let r = sales;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter((s) => {
        const customer = s.customerId ? customerMap.get(s.customerId) : null;
        return customer?.name.toLowerCase().includes(q);
      });
    }
    return r;
  }, [sales, searchQuery, customerMap]);

  // PLAN-112 (C2): usar subtotalBs (sin IGTF+IVA) para consistencia con DINERO-020
  // y con customerService.getCustomerStats/getCustomersRanking.
  const totalSpentUsd = useMemo(
    () => filteredSales.reduce((sum, s) => sum + (s.exchangeRate > 0 ? s.subtotalBs / s.exchangeRate : 0), 0),
    [filteredSales],
  );

  const uniqueCustomers = useMemo(() => {
    const set = new Set<string>();
    for (const s of filteredSales) {
      if (s.customerId) set.add(s.customerId);
    }
    return set.size;
  }, [filteredSales]);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 customer-kpi-grid">
        <div className="rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 to-primary/10 p-3 customer-kpi-card">
          <p className="text-xs text-text-secondary">Ventas con cliente</p>
          <p className="text-lg font-bold text-primary">{filteredSales.length}</p>
        </div>
        <div className="rounded-xl border border-accent/20 bg-linear-to-br from-accent/5 to-accent/10 p-3 customer-kpi-card">
          <p className="text-xs text-text-secondary">Total (Dólares)</p>
          <p className="text-lg font-bold text-accent">{formatUsd(totalSpentUsd)}</p>
        </div>
        <div className="rounded-xl border border-info/20 bg-linear-to-br from-info/5 to-info/10 p-3 customer-kpi-card">
          <p className="text-xs text-text-secondary">Clientes únicos</p>
          <p className="text-lg font-bold text-info">{uniqueCustomers}</p>
        </div>
      </div>

      {ranking.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp size={12} />
            Top 5 clientes
          </h4>
          <div className="space-y-1.5 customer-stagger">
            {ranking.map((c, i) => {
              const topSpent = ranking[0]?.totalSpentUsd ?? 1;
              const pct = topSpent > 0 ? Math.round((c.totalSpentUsd / topSpent) * 100) : 0;
              return (
                <div key={c.customerId} className="px-3 py-2 rounded-lg border border-gray-100 bg-white hover:shadow-sm hover:border-primary/20 transition-all duration-200">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-bold w-5 text-center shrink-0 ${i === 0 ? 'text-accent' : 'text-primary'}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900 min-w-0 flex-1 truncate">{c.customerName}</span>
                  </div>
                  <div className="flex items-center justify-between pl-7 mb-1">
                    <p className="text-xs text-text-secondary">{c.purchaseCount} compras · ticket {formatUsd(c.averageTicketUsd)}</p>
                    <p className="text-sm font-bold text-gray-900 shrink-0">{formatUsd(c.totalSpentUsd)}</p>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full progress-fill"
                      style={{ width: `${pct}%`, background: i === 0 ? 'var(--color-primary)' : 'var(--color-accent)' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <SearchInput
            maxLength={20}
            placeholder="Filtrar por nombre de cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
          />
        </div>
        <div className="w-full sm:w-44">
          <DatePicker
            value={startDate}
            onChange={(e) => {
              const v = e.target.value;
              setStartDate(v);
              if (v && endDate && v > endDate) setEndDate(v);
              if (v) {
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
                if (v > today) setStartDate(today);
              }
            }}
            formatHint="desde"
          />
        </div>
        <div className="w-full sm:w-44">
          <DatePicker
            value={endDate}
            onChange={(e) => {
              const v = e.target.value;
              setEndDate(v);
              if (v && startDate && v < startDate) setStartDate(v);
              if (v) {
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
                if (v > today) setEndDate(today);
              }
            }}
            formatHint="hasta"
          />
        </div>
        {(startDate || endDate || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStartDate(''); setEndDate(''); setSearchQuery(''); }}
            className="text-xs min-h-11"
          >
            Limpiar
          </Button>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
          Historial detallado
        </h4>
        {loading || rankingLoading ? (
          <div className="space-y-2 customer-stagger">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 rounded-lg shimmer" />
            ))}
          </div>
        ) : filteredSales.length === 0 ? (
          <EmptyState
            icon={<Calendar size={32} />}
            title="Sin ventas con clientes asignados"
            description="Las ventas con cliente aparecerán aquí. Asocia clientes a tus ventas en el POS."
          />
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto customer-stagger">
            {filteredSales.map((sale) => {
              const customer = sale.customerId ? customerMap.get(sale.customerId) : null;
              return (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSaleId(sale.id)}
                  className="px-3 py-2.5 rounded-lg border border-gray-100 bg-white hover:bg-gray-50/50 hover:shadow-sm hover:border-primary/10 transition-all duration-200 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 min-w-0 wrap-break-word">
                      {customer?.name ?? 'Cliente eliminado'}
                    </p>
                    <p className="text-sm font-bold text-gray-900 shrink-0">{formatBs(sale.totalBs)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-text-secondary">
                      {new Date(sale.createdAt).toLocaleString('es-VE', {
                        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                      {' · '}
                      {sale.paymentMethod === 'efectivo_bs' ? 'Efectivo Bs' :
                        sale.paymentMethod === 'efectivo_usd' ? 'Efectivo USD' :
                        sale.paymentMethod === 'pago_movil' ? 'Pago Móvil' : 'Tarjeta'}
                    </p>
                    <p className="text-xs text-text-secondary shrink-0">
                      {formatUsd(sale.exchangeRate > 0 ? sale.subtotalBs / sale.exchangeRate : 0)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {tenantId && (
        <SaleDetailModal
          saleId={selectedSaleId}
          tenantId={tenantId}
          isOpen={!!selectedSaleId}
          onClose={() => setSelectedSaleId(null)}
        />
      )}
    </>
  );
}
