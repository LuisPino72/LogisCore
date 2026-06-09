import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Spinner } from './Loading';
import { User } from 'lucide-react';
import { METADATA_PAGOS, type Sale } from '@/specs/pos';
import type { PaymentMethod } from '@/specs/pos';
import { IGTF_RATE } from '@logiscore/shared';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { posService } from '@/features/pos/services/posService';
import { customerService } from '@/features/customers/services/customerService';

interface SaleDetailModalProps {
  saleId: string | null;
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface SaleInfo {
  id: string;
  createdAt: string;
  paymentMethod: string;
  exchangeRate: number;
  subtotalBs: number;
  igtfBs: number;
  ivaBs: number;
  totalBs: number;
}

interface SaleItemInfo {
  id: string;
  productName: string;
  presentationName?: string;
  quantity: number;
  totalPriceUsd: number;
}

interface CustomerInfo {
  name: string;
  cedula?: string;
}

export function SaleDetailModal({ saleId, tenantId, isOpen, onClose }: SaleDetailModalProps) {
  const [sale, setSale] = useState<SaleInfo | null>(null);
  const [items, setItems] = useState<SaleItemInfo[]>([]);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !saleId) {
      setSale(null);
      setItems([]);
      setCustomer(null);
      return;
    }

    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      try {
        const salesResult = await posService.getSalesHistory(tenantId, 0, 1000);
        if (cancelled) return;

        if (salesResult.ok) {
          const found = salesResult.data.sales.find((s: Sale) => s.id === saleId);
          if (found && !cancelled) {
            setSale(found);

            if (found.customerId) {
              const custResult = await customerService.getCustomerById(found.customerId, tenantId);
              if (!cancelled && custResult.ok && custResult.data) {
                setCustomer({ name: custResult.data.name, cedula: custResult.data.cedula });
              }
            }
          }
        }

        const itemsResult = await posService.getSaleItems(tenantId, saleId);
        if (!cancelled && itemsResult.ok) {
          setItems(itemsResult.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [isOpen, saleId, tenantId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detalle de venta"
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : sale ? (
        <div className="flex flex-col gap-3">
          {customer && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
              <User size={14} className="text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {customer.cedula || customer.name}
                </p>
                {customer.cedula && customer.name && (
                  <p className="text-[10px] text-text-secondary truncate">{customer.name}</p>
                )}
              </div>
            </div>
          )}

          <div className="text-sm text-gray-600 space-y-1">
            <p><strong>Fecha:</strong> {new Date(sale.createdAt).toLocaleString('es-VE')}</p>
            <p><strong>Método:</strong> {METADATA_PAGOS[sale.paymentMethod as PaymentMethod]?.label ?? sale.paymentMethod}</p>
            <p><strong>Tasa:</strong> {sale.exchangeRate.toFixed(4)} Bs/$</p>
          </div>

          <div className="border-t border-border pt-2">
            <h4 className="text-sm font-semibold mb-2">Productos</h4>
            <div className="space-y-1.5">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.productName}{item.presentationName ? ` - ${item.presentationName}` : ''} x {item.quantity}</span>
                  <span className="font-medium">{formatUsd(item.totalPriceUsd)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-2 space-y-1">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatUsd(sale.exchangeRate > 0 ? sale.subtotalBs / sale.exchangeRate : 0)} / {formatBs(sale.subtotalBs)}</span>
            </div>
            {sale.igtfBs > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>IGTF ({(IGTF_RATE * 100).toFixed(0)}%)</span>
                <span>{formatBs(sale.igtfBs)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-600">
              <span>IVA (16%)</span>
              <span>{formatBs(sale.ivaBs ?? 0)}</span>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{formatBs(sale.totalBs)} / {formatUsd(sale.exchangeRate > 0 ? sale.totalBs / sale.exchangeRate : 0)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
