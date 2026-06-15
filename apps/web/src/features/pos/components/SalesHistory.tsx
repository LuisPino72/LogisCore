import { useState, useEffect, useCallback, memo } from 'react';
import { Button, Badge, DataTable, EmptyState, Skeleton, DatePicker, SaleDetailModal } from '../../../common/components';
import { Eye, Ban, Calendar } from 'lucide-react';
import { useDebounce } from '../../../common/hooks/useDebounce';
import { EventBus } from '@logiscore/core';
import type { Column } from '../../../common/components';
import type { Sale } from '../types';
import type { PaymentMethod } from '../../../specs/pos';
import { usePosStore } from '../stores/posStore';
import { METADATA_PAGOS } from '../../../specs/pos';
import { formatBs, formatUsd } from '@/lib/formatBs';

const PAGE_SIZE = 20;

interface SalesHistoryProps {
  tenantId: string;
  sales: Sale[];
  total: number;
  onVoid: (saleId: string) => void;
  loading: boolean;
  canVoid: boolean;
}

export const SalesHistory = memo(function SalesHistory({ tenantId, sales, total, onVoid, loading, canVoid }: SalesHistoryProps) {
  const [page, setPage] = useState(1);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const debouncedStartDate = useDebounce(startDate, 400);
  const debouncedEndDate = useDebounce(endDate, 400);

  // Auto-swap if start > end, and reject future dates
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (startDate && startDate > today) {
      setStartDate(today);
    }
    if (endDate && endDate > today) {
      setEndDate(today);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (debouncedStartDate && debouncedEndDate && debouncedStartDate > debouncedEndDate) {
      setStartDate(debouncedEndDate);
      setEndDate(debouncedStartDate);
    }
  }, [debouncedStartDate, debouncedEndDate]);

  const fetchSalesHistory = usePosStore((s) => s.fetchSalesHistory);

  const handleSort = useCallback((key: string) => {
    setSortDirection((prev) => (sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
    setSortKey(key);
  }, [sortKey]);

  useEffect(() => {
    setPage(1);
  }, [debouncedStartDate, debouncedEndDate, tenantId]);

  useEffect(() => {
    const offset = (page - 1) * PAGE_SIZE;
    fetchSalesHistory(tenantId, offset, PAGE_SIZE, debouncedStartDate || undefined, debouncedEndDate || undefined);
  }, [page, tenantId, fetchSalesHistory, debouncedStartDate, debouncedEndDate]);

  useEffect(() => {
    const sub = EventBus.on('SALE.COMPLETED', () => {
      const offset = (page - 1) * PAGE_SIZE;
      fetchSalesHistory(tenantId, offset, PAGE_SIZE, debouncedStartDate || undefined, debouncedEndDate || undefined);
    });
    return () => EventBus.off(sub);
  }, [page, tenantId, fetchSalesHistory, debouncedStartDate, debouncedEndDate]);

  const handleView = (sale: Sale) => {
    setSelectedSale(sale);
  };

  const columns: Column<Sale>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      sortable: true,
      render: (sale) => (
        <span className="text-xs text-gray-500">
          {new Date(sale.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Método',
      render: (sale) => {
        const meta = METADATA_PAGOS[sale.paymentMethod as PaymentMethod];
        return (
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="info">{meta?.label ?? sale.paymentMethod}</Badge>
            {sale.isCreditSale && (
              <Badge variant={sale.creditCollected ? 'success' : 'warning'}>
                {sale.creditCollected ? 'Cobrado' : 'Fiado'}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'totalBs',
      header: 'Total',
      sortable: true,
      className: 'text-right',
      render: (sale) => {
        const totalUsd = sale.exchangeRate > 0 ? sale.totalBs / sale.exchangeRate : 0;
        return (
          <div className="text-right">
            <p className="text-sm font-bold">{formatBs(sale.totalBs)}</p>
            <p className="text-[10px] text-gray-800">{formatUsd(totalUsd)}</p>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (sale) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleView(sale)} className="p-1.5" title="Ver detalle">
            <Eye size={16} />
          </Button>
          {canVoid && (
            <Button variant="ghost" size="sm" onClick={() => onVoid(sale.id)} className="p-1.5" title="Anular venta">
              <Ban size={16} className="text-danger" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col h-full p-3">
      <div className="flex gap-1 sm:hidden mb-2 shrink-0 overflow-x-auto">
        {[
          { label: 'Hoy', getRange: () => { const d = new Date(); return { start: d.toISOString().split('T')[0], end: d.toISOString().split('T')[0] }; } },
          { label: 'Ayer', getRange: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { start: d.toISOString().split('T')[0], end: d.toISOString().split('T')[0] }; } },
          { label: '7 días', getRange: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 7); return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }; } },
          { label: '30 días', getRange: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 30); return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }; } },
        ].map(({ label, getRange }) => (
          <button
            key={label}
            type="button"
            onClick={() => { const r = getRange(); setStartDate(r.start); setEndDate(r.end); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap bg-surface-alt text-gray-600 border border-border hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            {label}
          </button>
        ))}
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap text-danger hover:bg-red-50 transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      <div className="hidden sm:flex gap-2 mb-3 shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Calendar size={16} />
          <span>Desde:</span>
          <DatePicker
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            formatHint="dd/mm/aaaa"
            className="w-36"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Hasta:</span>
          <DatePicker
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            formatHint="dd/mm/aaaa"
            className="w-36"
          />
        </div>
        {(startDate || endDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="text-xs"
          >
            Limpiar
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex-1 space-y-3 py-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="shimmer" className="h-12 rounded-lg" />
          ))}
        </div>
      ) : sales.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<Calendar size={40} />}
            title={startDate || endDate ? 'Sin ventas en este período' : 'Aún no hay ventas'}
            description={startDate || endDate ? 'No se encontraron ventas en las fechas seleccionadas. Intenta con otro rango.' : 'Cuando realices tu primera venta, aparecerá aquí.'}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <DataTable
            columns={columns}
            data={sales}
            keyExtractor={(s) => s.id}
            emptyMessage="Sin ventas"
            renderCardOnMobile
            page={page}
            onPageChange={setPage}
            total={total}
            pageSize={PAGE_SIZE}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 shrink-0 text-xs text-gray-500">
          <span>{total} ventas en total</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span className="px-2">{page} / {totalPages}</span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <SaleDetailModal
        saleId={selectedSale?.id ?? null}
        tenantId={tenantId}
        isOpen={!!selectedSale}
        onClose={() => setSelectedSale(null)}
      />
    </div>
  );
});
