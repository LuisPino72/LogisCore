import { useState, useEffect, useCallback, memo } from 'react';
import { Button, Badge, Modal, DataTable, EmptyState, Skeleton, DatePicker } from '../../../common/components';
import { Eye, Ban, Calendar } from 'lucide-react';
import { useDebounce } from '../../../common/hooks/useDebounce';
import { EventBus } from '@logiscore/core';
import type { Column } from '../../../common/components';
import type { Sale } from '../types';
import type { PaymentMethod } from '../../../specs/pos';
import { usePosStore } from '../stores/posStore';
import { METADATA_PAGOS } from '../../../specs/pos';
import { IGTF_RATE } from '@logiscore/shared';
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

  const fetchSalesHistory = usePosStore((s) => s.fetchSalesHistory);
  const saleItems = usePosStore((s) => s.saleItems);
  const saleItemsLoading = usePosStore((s) => s.saleItemsLoading);
  const fetchSaleItems = usePosStore((s) => s.fetchSaleItems);

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

  const handleView = async (sale: Sale) => {
    setSelectedSale(sale);
    await fetchSaleItems(tenantId, sale.id);
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
        return <Badge variant="info">{meta?.label ?? sale.paymentMethod}</Badge>;
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
      <div className="flex flex-col sm:flex-row gap-2 mb-3 shrink-0">
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

      <Modal
        isOpen={!!selectedSale}
        onClose={() => { setSelectedSale(null); usePosStore.setState({ saleItems: [] }); }}
        title="Detalle de venta"
      >
        {selectedSale && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Fecha:</strong> {new Date(selectedSale.createdAt).toLocaleString('es-VE')}</p>
              <p><strong>Método:</strong> {METADATA_PAGOS[selectedSale.paymentMethod as PaymentMethod]?.label ?? selectedSale.paymentMethod}</p>
              <p><strong>Tasa:</strong> {selectedSale.exchangeRate.toFixed(4)} Bs/$</p>
            </div>

            <div className="border-t border-border pt-2">
              <h4 className="text-sm font-semibold mb-2">Productos</h4>
              {saleItemsLoading ? (
                <p className="text-xs text-gray-400">Cargando...</p>
              ) : (
                <div className="space-y-1.5">
                  {saleItems.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.productName}{item.presentationName ? ` - ${item.presentationName}` : ''} x {item.quantity}</span>
                      <span className="font-medium">{formatUsd(item.totalPriceUsd)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-2 space-y-1">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{formatUsd(selectedSale.exchangeRate > 0 ? selectedSale.subtotalBs / selectedSale.exchangeRate : 0)} / {formatBs(selectedSale.subtotalBs)}</span>
              </div>
              {selectedSale.igtfBs > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  {/* AUDIT-FLOW-2-004: porcentaje derivado de IGTF_RATE (Regla #8), no hardcoded. */}
                  <span>IGTF ({(IGTF_RATE * 100).toFixed(0)}%)</span>
                  <span>{formatBs(selectedSale.igtfBs)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-gray-600">
                <span>IVA (16%)</span>
                <span>{formatBs(selectedSale.ivaBs ?? 0)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatBs(selectedSale.totalBs)} / {formatUsd(selectedSale.exchangeRate > 0 ? selectedSale.totalBs / selectedSale.exchangeRate : 0)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
});
