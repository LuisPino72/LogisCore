import { preciseRound, IGTF_RATE } from '@logiscore/shared';
import { Button } from '../../../common/components';
import { ShoppingCart, Pause } from 'lucide-react';
import type { CartItem, PaymentMethod } from '../types';
import { METADATA_PAGOS, PAYMENT_METHODS } from '../../../specs/sales';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface CartSummaryProps {
  items: CartItem[];
  exchangeRateBs: number;
  paymentMethod: PaymentMethod | null;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onPay: () => void;
  onPark: () => void;
  isOpen: boolean;
  loading: boolean;
}

export function CartSummary({
  items,
  exchangeRateBs,
  paymentMethod,
  onPaymentMethodChange,
  onPay,
  onPark,
  isOpen,
  loading,
}: CartSummaryProps) {
  const subtotalUsd = items.reduce(
    (sum, item) => sum + item.totalPriceUsd,
    0,
  );
  const subtotalBs = exchangeRateBs > 0 ? subtotalUsd * exchangeRateBs : 0;

  const igtfBs = paymentMethod === 'efectivo_usd' && IGTF_RATE > 0 ? preciseRound(subtotalBs * IGTF_RATE, 2) : 0;
  const igtfUsd = paymentMethod === 'efectivo_usd' && IGTF_RATE > 0 && exchangeRateBs > 0 ? preciseRound(igtfBs / exchangeRateBs, 2) : 0;

  const subtotalTaxableBs = items.reduce((sum, item) => {
    if (item.isTaxable === false) return sum;
    return sum + item.totalPriceUsd * exchangeRateBs;
  }, 0);
  const ivaBs = preciseRound(subtotalTaxableBs * 0.16, 2);
  const ivaUsd = exchangeRateBs > 0 ? preciseRound(ivaBs / exchangeRateBs, 2) : 0;

  const totalBs = preciseRound(subtotalBs + igtfBs + ivaBs, 2);
  const totalUsd = exchangeRateBs > 0 ? preciseRound(totalBs / exchangeRateBs, 2) : subtotalUsd;

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <div className="flex justify-between text-sm text-gray-600">
        <span>Subtotal</span>
        <span>{formatUsd(subtotalUsd)} / {formatBs(subtotalBs)}</span>
      </div>

      {paymentMethod === 'efectivo_usd' && IGTF_RATE > 0 && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>IGTF (3%)</span>
          <span>{formatBs(igtfBs)} / {formatUsd(igtfUsd)}</span>
        </div>
      )}

      {subtotalTaxableBs > 0 && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>IVA (16%)</span>
          <span>{formatBs(ivaBs)} / {formatUsd(ivaUsd)}</span>
        </div>
      )}

      <div className="flex justify-between text-base font-bold text-gray-900">
        <span>Total</span>
        <span>{formatBs(totalBs)} / {formatUsd(totalUsd)}</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {PAYMENT_METHODS.map((m) => {
          const meta = METADATA_PAGOS[m];
          const selected = paymentMethod === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPaymentMethodChange(m)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all min-h-11 ${
                selected
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white text-text-secondary border-border hover:border-primary/30 hover:text-primary'
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1 min-h-11"
          disabled={items.length === 0}
          onClick={onPark}
        >
          <Pause size={16} />
          Pausar
        </Button>
        <Button
          variant="primary"
          className="flex-2 min-h-11"
          disabled={!isOpen || items.length === 0 || !paymentMethod || exchangeRateBs <= 0}
          loading={loading}
          onClick={onPay}
        >
          <ShoppingCart size={16} />
          {isOpen ? 'Pagar' : 'Caja cerrada'}
        </Button>
      </div>
    </div>
  );
}
