import { useState, useEffect } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Modal, Button, Input } from '../../../common/components';
import { formatUsd } from '@/lib/formatBs';
import { METADATA_PAGOS } from '../../../specs/pos';
import type { PaymentMethod } from '../types';
import type { DexieSale } from '../../../services/dexie/types';

export interface OrderPayModalProps {
  isOpen: boolean;
  sale: { sale: DexieSale; method: PaymentMethod | null } | null;
  processing: boolean;
  onConfirm: (deliveryFee?: number) => void;
  onCancel: () => void;
  onMethodChange: (method: PaymentMethod) => void;
  defaultDeliveryFee?: number;
}

export function OrderPayModal({ isOpen, sale, processing, onConfirm, onCancel, onMethodChange, defaultDeliveryFee = 0 }: OrderPayModalProps) {
  const [deliveryFee, setDeliveryFee] = useState(defaultDeliveryFee.toString());
  const isDelivery = sale?.sale.orderType === 'delivery';

  useEffect(() => {
    if (isOpen) {
      setDeliveryFee(defaultDeliveryFee > 0 ? defaultDeliveryFee.toString() : '');
    }
  }, [isOpen, defaultDeliveryFee]);

  const parsedFee = Math.min(Math.max(parseFloat(deliveryFee) || 0, 0), 1000);
  const baseTotal = sale?.sale.totalUsd ?? 0;
  const total = baseTotal + (isDelivery && parsedFee > 0 ? parsedFee : 0);
  const feeExceedsMax = parseFloat(deliveryFee) > 1000;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Cobrar Pedido"
      size="sm"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>Cancelar</Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => onConfirm(isDelivery && parsedFee > 0 ? parsedFee : undefined)}
            disabled={!sale?.method || feeExceedsMax}
            loading={processing}
          >
            Confirmar cobro
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-2 animate-slide-down">
        {sale?.sale && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ShoppingCart size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-900">{formatUsd(total)}</p>
              <p className="text-xs text-text-secondary">{sale.sale.orderNumber}</p>
            </div>
          </div>
        )}
        {isDelivery && (
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Cargo de delivery (opcional)</label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="1000"
              placeholder="0.00"
              value={deliveryFee}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || (parseFloat(v) >= 0 && parseFloat(v) <= 1000)) setDeliveryFee(v);
              }}
              className={`text-sm ${feeExceedsMax ? 'border-red-400' : ''}`}
            />
            <p className="text-xs text-gray-400 mt-1">Monto que el cliente paga por envío (max $1,000)</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {(['efectivo_bs', 'efectivo_usd', 'pago_movil', 'credito'] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMethodChange(m)}
              className={`p-2.5 rounded-xl border text-xs font-medium transition-all min-h-11 ${
                sale?.method === m
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-white text-gray-700 hover:border-primary/30'
              }`}
            >
              {METADATA_PAGOS[m]?.label ?? m}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
