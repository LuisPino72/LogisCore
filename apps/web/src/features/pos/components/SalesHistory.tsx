import { useState } from 'react';
import { Button, Badge, Modal, DataTable } from '../../../common/components';
import { Eye, Ban, ShoppingCart, Calendar } from 'lucide-react';
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
}

export function SalesHistory({ tenantId: _tenantId, sales, onVoid, loading }: SalesHistoryProps) {
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
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
      key: 'id',
      header: 'Venta',
      render: (sale) => (
        <div className="flex items-center gap-2">
          <ShoppingCart size={14} className="text-primary" />
          <span className="text-sm font-medium">#{sale.id.slice(0, 8).toUpperCase()}</span>
        </div>
      ),
    },
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
          <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => handleView(sale)} />
          <Button variant="ghost" size="sm" icon={<Ban size={14} className="text-danger" />} onClick={() => onVoid(sale.id)} />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full p-3">
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-gray-500">Cargando ventas...</span>
        </div>
      ) : sales.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
          <Calendar size={40} className="text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Aún no hay ventas registradas.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <DataTable
            columns={columns}
            data={sales}
            keyExtractor={(s) => s.id}
            emptyMessage="Sin ventas"
            renderCardOnMobile
          />
        </div>
      )}

      <Modal
        isOpen={!!selectedSale}
        onClose={() => { setSelectedSale(null); setSaleItems([]); }}
        title={`Venta #${selectedSale?.id.slice(0, 8).toUpperCase() ?? ''}`}
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
