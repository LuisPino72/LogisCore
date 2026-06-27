import { ShoppingCart, User } from 'lucide-react';
import { Modal, Button, Badge } from '../../../common/components';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { preciseRound } from '@logiscore/shared';
import { METADATA_PAGOS } from '../../../specs/pos';
import type { CartItem } from '../types';
import type { PaymentMethod } from '../types';
import type { Customer } from '../../../specs/customers';

export interface PayConfirmModalProps {
  isOpen: boolean;
  cart: CartItem[];
  exchangeRateBs: number;
  paymentMethod: PaymentMethod | null;
  selectedCustomer: Customer | null;
  isCreditSale: boolean;
  processing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PayConfirmModal({ isOpen, cart, exchangeRateBs, paymentMethod, selectedCustomer, isCreditSale, processing, onConfirm, onCancel }: PayConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Confirmar venta"
      size="sm"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" className="flex-1" onClick={onConfirm} loading={processing}>Confirmar venta</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-2 animate-slide-down">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingCart size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{formatUsd(cart.reduce((s, i) => s + i.totalPriceUsd, 0))}</p>
            <p className="text-xs text-text-secondary">{formatBs(preciseRound(cart.reduce((s, i) => s + i.totalPriceUsd, 0) * exchangeRateBs, 2))}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-surface-alt rounded-lg p-2.5">
            <p className="text-xs text-text-secondary">Productos</p>
            <p className="font-semibold text-gray-900">{cart.reduce((s, i) => s + i.quantity, 0)} unidades</p>
          </div>
          <div className="bg-surface-alt rounded-lg p-2.5">
            <p className="text-xs text-text-secondary">Método de pago</p>
            <p className="font-semibold text-gray-900">{paymentMethod ? METADATA_PAGOS[paymentMethod]?.label ?? paymentMethod : '-'}</p>
          </div>
        </div>
        {selectedCustomer && (
          <div className="flex items-center gap-2 bg-primary/5 rounded-lg p-2.5 text-sm">
            <User size={14} className="text-primary shrink-0" />
            <span className="font-medium text-gray-900 truncate">{selectedCustomer.name}</span>
            {isCreditSale && <Badge variant="warning" className="text-[10px]">Fiado</Badge>}
          </div>
        )}
      </div>
    </Modal>
  );
}
