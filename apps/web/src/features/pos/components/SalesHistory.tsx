import { useState, useEffect } from 'react';
import { Button, Badge, Modal, DataTable, EmptyState, Skeleton } from '../../../common/components';
import { Eye, Ban, Calendar } from 'lucide-react';
import type { Column } from '../../../common/components';
import type { Sale, SaleItem } from '../types';
import type { PaymentMethod } from '../../../specs/pos';
import { posService } from '../services/posService';
import { METADATA_PAGOS } from '../../../specs/sales';

interface SalesHistoryProps {
  tenantId: string;
  sales: Sale[];
  onVoid: (saleId: string) => void;
  loading: boolean;
  canVoid: boolean;
}

export function SalesHistory({ tenantId: _tenantId, sales, onVoid, loading, canVoid }: SalesHistoryProps) {
  const [page, setPage] = useState(1);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  useEffect(() => {
    setPage(1);
  }, [sales.length]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const handleView = async (sale: Sale) => {
    setSelectedSale(sale);
    setItemsLoading(true);
    const result = await posService.getSaleItems(sale.id);
    if (result.ok) setSaleItems(result.data);
    setItemsLoading(false);
  };

  const columns: Column<Sale>[] = [
    {
      key: 'date',
      header: 'Fecha',
      render: (sale) => (
        <span className="text-xs text-gray-500">
          {new Date(sale.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Método',
      render: (sale) => {
        const meta = METADATA_PAGOS[sale.paymentMethod as PaymentMethod];
        return <Badge variant="info">{meta?.label ?? sale.paymentMethod}</Badge>;
      },
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right',
      render: (sale) => {
        const totalUsd = sale.exchangeRate > 0 ? sale.totalBs / sale.exchangeRate : 0;
        return (
          <div className="text-right">
            <p className="text-sm font-bold">Bs {sale.totalBs.toFixed(2)}</p>
            <p className="text-[10px] text-gray-400">$ {totalUsd.toFixed(2)}</p>
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

  return (
    <div className="flex flex-col h-full p-3">
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
            title="Sin ventas"
            description="Aún no hay ventas registradas."
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
            total={sales.length}
          />
        </div>
      )}

      <Modal
        isOpen={!!selectedSale}
        onClose={() => { setSelectedSale(null); setSaleItems([]); }}
        title="Detalle de venta"
      >
        {selectedSale && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Fecha:</strong> {new Date(selectedSale.createdAt).toLocaleString('es-VE')}</p>
              <p><strong>Método:</strong> {METADATA_PAGOS[selectedSale.paymentMethod as PaymentMethod]?.label ?? selectedSale.paymentMethod}</p>
              <p><strong>Tasa:</strong> {selectedSale.exchangeRate.toFixed(4)} Bs/USD</p>
            </div>

            <div className="border-t border-border pt-2">
              <h4 className="text-sm font-semibold mb-2">Productos</h4>
              {itemsLoading ? (
                <p className="text-xs text-gray-400">Cargando...</p>
              ) : (
                <div className="space-y-1.5">
                  {saleItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.productName} x {item.quantity}</span>
                      <span className="font-medium">$ {item.totalPriceUsd.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-2 space-y-1">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>$ {(selectedSale.exchangeRate > 0 ? selectedSale.subtotalBs / selectedSale.exchangeRate : 0).toFixed(2)} / Bs {selectedSale.subtotalBs.toFixed(2)}</span>
              </div>
              {selectedSale.igtfBs > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>IGTF (3%)</span>
                  <span>Bs {selectedSale.igtfBs.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-gray-600">
                <span>IVA (16%)</span>
                <span>Bs {(selectedSale.ivaBs !== undefined ? selectedSale.ivaBs : 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>Bs {selectedSale.totalBs.toFixed(2)} / $ {(selectedSale.exchangeRate > 0 ? selectedSale.totalBs / selectedSale.exchangeRate : 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
