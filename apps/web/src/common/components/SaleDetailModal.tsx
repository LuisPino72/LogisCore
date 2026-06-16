import { useState, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Spinner } from './Loading';
import { User, FileText, MessageCircle } from 'lucide-react';
import { METADATA_PAGOS, type Sale } from '@/specs/pos';
import type { PaymentMethod } from '@/specs/pos';
import { IGTF_RATE } from '@logiscore/shared';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { posService } from '@/features/pos/services/posService';
import { customerService } from '@/features/customers/services/customerService';
import { dashboardService } from '@/features/dashboard/services/dashboardService';
import { receiptService } from '@/features/pos/services/receiptService';
import type { TenantInfoResponse } from '@/features/dashboard/types';

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
  customerId?: string;
}

interface SaleItemInfo {
  id: string;
  productName: string;
  presentationName?: string;
  quantity: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
}

interface CustomerInfo {
  name: string;
  phone?: string;
  cedula?: string;
}

export function SaleDetailModal({ saleId, tenantId, isOpen, onClose }: SaleDetailModalProps) {
  const [sale, setSale] = useState<SaleInfo | null>(null);
  const [items, setItems] = useState<SaleItemInfo[]>([]);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [tenantInfo, setTenantInfo] = useState<TenantInfoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!isOpen || !saleId) {
      setSale(null);
      setItems([]);
      setCustomer(null);
      setTenantInfo(null);
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
                setCustomer({
                  name: custResult.data.name,
                  phone: custResult.data.phone,
                  cedula: custResult.data.cedula,
                });
              }
            }
          }
        }

        const itemsResult = await posService.getSaleItems(tenantId, saleId);
        if (!cancelled && itemsResult.ok) {
          setItems(itemsResult.data);
        }

        const tenantResult = await dashboardService.getTenantInfo(tenantId);
        if (!cancelled && tenantResult.ok && tenantResult.data) {
          setTenantInfo(tenantResult.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [isOpen, saleId, tenantId]);

  const handleWhatsAppShare = useCallback(async (mode: 'ticket' | 'a4' | 'text') => {
    if (!sale || !tenantInfo) return;
    setSharing(true);
    await new Promise((r) => setTimeout(r, 300));
    try {
      const subtotalUsd = sale.exchangeRate > 0 ? sale.subtotalBs / sale.exchangeRate : 0;
      const saleData = {
        id: sale.id,
        createdAt: sale.createdAt,
        paymentMethod: sale.paymentMethod,
        exchangeRate: sale.exchangeRate,
        subtotalBs: sale.subtotalBs,
        igtfBs: sale.igtfBs,
        ivaBs: sale.ivaBs,
        totalBs: sale.totalBs,
        subtotalUsd,
        igtfUsd: sale.exchangeRate > 0 ? sale.igtfBs / sale.exchangeRate : 0,
        ivaUsd: sale.exchangeRate > 0 ? sale.ivaBs / sale.exchangeRate : 0,
        totalUsd: sale.exchangeRate > 0 ? sale.totalBs / sale.exchangeRate : 0,
      };
      const itemsData = items.map((i) => ({
        productName: i.productName,
        presentationName: i.presentationName,
        quantity: i.quantity,
        unitPriceUsd: i.unitPriceUsd,
        totalPriceUsd: i.totalPriceUsd,
      }));

      if (mode === 'text') {
        const link = receiptService.generateWhatsAppLink(saleData, itemsData, customer, tenantInfo);
        if (link) {
          window.open(link, '_blank');
        }
      } else {
        const result = await receiptService.sharePdfViaWhatsApp(saleData, itemsData, customer, tenantInfo, mode);
        if (!result.ok) {
          window.open(`https://wa.me`, '_blank');
        }
      }
    } finally {
      setSharing(false);
    }
  }, [sale, items, customer, tenantInfo]);

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

          {/* Action buttons */}
          <div className="border-t border-border pt-3 flex flex-col gap-2">
            <Button
              variant="primary"
              fullWidth
              onClick={() => handleWhatsAppShare('ticket')}
              disabled={sharing || !tenantInfo}
              className="min-h-11"
              style={{ backgroundColor: '#25D366', borderColor: '#25D366', color: 'white' }}
            >
              <FileText size={16} />
              {sharing ? 'Enviando...' : 'Ticket por WhatsApp'}
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={() => handleWhatsAppShare('a4')}
              disabled={sharing || !tenantInfo}
              className="min-h-11"
              style={{ backgroundColor: '#25D366', borderColor: '#25D366', color: 'white' }}
            >
              <FileText size={16} />
              {sharing ? 'Enviando...' : 'Factura por WhatsApp'}
            </Button>
            {customer?.phone && typeof customer.phone === 'string' && (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => handleWhatsAppShare('text')}
                disabled={sharing}
                className="min-h-11"
                style={{ backgroundColor: '#25D366', borderColor: '#25D366', color: 'white' }}
              >
                <MessageCircle size={16} />
                {sharing ? 'Enviando...' : 'Solo texto por WhatsApp'}
              </Button>
            )}
          </div>

          {sharing && (
            <div className="fixed inset-0 z-99999 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white shadow-2xl border border-gray-100 animate-slide-down">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                  <MessageCircle size={28} className="text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900">Enviando por WhatsApp</p>
                  <p className="text-xs text-gray-700 mt-1">Generando PDF y abriendo WhatsApp...</p>
                </div>
                <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-shimmer" style={{ width: '40%', backgroundSize: '200px 100%' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
