import { ShoppingCart } from 'lucide-react';
import { Modal, Button } from '../../../common/components';
import { formatUsd } from '@/lib/formatBs';
import { METADATA_PAGOS } from '../../../specs/pos';
import type { PaymentMethod } from '../types';
import type { DexieSale } from '../../../services/dexie/types';

interface OrderPayModalProps {
  isOpen: boolean;
  sale: { sale: DexieSale; method: PaymentMethod | null } | null;
  processing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onMethodChange: (method: PaymentMethod) => void;
}

export function OrderPayModal({ isOpen, sale, processing, onConfirm, onCancel, onMethodChange }: OrderPayModalProps) {
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
            onClick={onConfirm}
            disabled={!sale?.method}
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
            <div>
              <p className="text-lg font-bold text-gray-900">{formatUsd(sale.sale.totalUsd)}</p>
              <p className="text-xs text-text-secondary">{sale.sale.orderNumber}</p>
            </div>
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
