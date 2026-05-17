import { preciseRound } from '@logiscore/shared';
import { Button, Badge } from '../../../common/components';
import { ShoppingCart, Pause } from 'lucide-react';
import type { CartItem, PaymentMethod } from '../types';
import { METADATA_PAGOS, PAYMENT_METHODS } from '../../../specs/sales';

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

  const igtfBs = paymentMethod === 'efectivo_usd' ? preciseRound(subtotalBs * 0.03, 2) : 0;
  const igtfUsd = paymentMethod === 'efectivo_usd' && exchangeRateBs > 0 ? preciseRound(igtfBs / exchangeRateBs, 2) : 0;

  const subtotalTaxableBs = items.reduce((sum, item) => {
    if (item.isTaxable === false) return sum;
    return sum + item.totalPriceUsd * exchangeRateBs;
  }, 0);
  const ivaBs = preciseRound(subtotalTaxableBs * 0.16, 2);
  const ivaUsd = exchangeRateBs > 0 ? preciseRound(ivaBs / exchangeRateBs, 2) : 0;

  const totalBs = preciseRound(subtotalBs + igtfBs + ivaBs, 2);
  const totalUsd = exchangeRateBs > 0 ? preciseRound(totalBs / exchangeRateBs, 2) : subtotalUsd;

  const fmt = (n: number) => n.toFixed(2);

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <div className="flex justify-between text-sm text-gray-600">
        <span>Subtotal</span>
        <span>$ {fmt(subtotalUsd)} / Bs {fmt(subtotalBs)}</span>
      </div>

      {paymentMethod === 'efectivo_usd' && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>IGTF (3%)</span>
          <span>Bs {fmt(igtfBs)} / $ {fmt(igtfUsd)}</span>
        </div>
      )}

      <div className="flex justify-between text-sm text-gray-600">
        <span>IVA (16%)</span>
        <span>Bs {fmt(ivaBs)} / $ {fmt(ivaUsd)}</span>
      </div>

      <div className="flex justify-between text-base font-bold text-gray-900">
        <span>Total</span>
        <span>Bs {fmt(totalBs)} / $ {fmt(totalUsd)}</span>
      </div>

      <div className="flex gap-0.5 flex-wrap">
        {PAYMENT_METHODS.map((m) => {
          const meta = METADATA_PAGOS[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPaymentMethodChange(m)}
              className="cursor-pointer min-h-[44px] flex items-center px-1"
            >
              <Badge variant={paymentMethod === m ? 'info' : 'neutral'} className="text-xs px-2 py-1">
                {meta.label}
              </Badge>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1 min-h-[44px]"
          disabled={items.length === 0}
          onClick={onPark}
        >
          <Pause size={16} />
          Pausar
        </Button>
        <Button
          variant="primary"
          className="flex-2 min-h-[44px]"
          disabled={!isOpen || items.length === 0 || !paymentMethod}
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
