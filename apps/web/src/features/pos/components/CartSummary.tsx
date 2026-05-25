import { useState } from 'react';
import { preciseRound, IGTF_RATE, IVA_RATE } from '@logiscore/shared';
import { Button } from '../../../common/components';
import { ShoppingCart, Pause, Percent, DollarSign, X } from 'lucide-react';
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
  discount: { type: 'percentage' | 'fixed'; value: number } | null;
  onSetDiscount: (type: 'percentage' | 'fixed', value: number) => void;
  onClearDiscount: () => void;
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
  discount,
  onSetDiscount,
  onClearDiscount,
}: CartSummaryProps) {
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountInput, setDiscountInput] = useState('');

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

  let discountBs = 0;
  let discountUsd = 0;
  let ivaBase = subtotalTaxableBs;

  if (discount) {
    if (discount.type === 'percentage') {
      const pct = Math.min(discount.value, 100);
      discountBs = preciseRound(subtotalBs * pct / 100, 2);
      const taxableDiscount = preciseRound(subtotalTaxableBs * pct / 100, 2);
      ivaBase = subtotalTaxableBs - taxableDiscount;
    } else {
      discountBs = preciseRound(discount.value * exchangeRateBs, 2);
      if (subtotalBs > 0) {
        const taxableRatio = subtotalTaxableBs / subtotalBs;
        const taxableDiscount = preciseRound(discountBs * taxableRatio, 2);
        ivaBase = subtotalTaxableBs - taxableDiscount;
      }
    }
    discountBs = Math.min(discountBs, subtotalBs);
    ivaBase = Math.max(0, ivaBase);
    discountUsd = exchangeRateBs > 0 ? preciseRound(discountBs / exchangeRateBs, 2) : 0;
  }

  const ivaBs = preciseRound(ivaBase * IVA_RATE, 2);
  const ivaUsd = exchangeRateBs > 0 ? preciseRound(ivaBs / exchangeRateBs, 2) : 0;

  const totalBs = preciseRound(subtotalBs + igtfBs + ivaBs - discountBs, 2);
  const totalUsd = exchangeRateBs > 0 ? preciseRound(totalBs / exchangeRateBs, 2) : (subtotalUsd - discountUsd);

  const handleApplyDiscount = () => {
    const val = parseFloat(discountInput);
    if (!val || val <= 0) return;
    if (discountType === 'percentage' && val > 100) return;
    if (discountType === 'fixed' && val > subtotalUsd) return;
    onSetDiscount(discountType, val);
    setShowDiscountInput(false);
    setDiscountInput('');
  };

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <div className="flex justify-between text-sm text-gray-600">
        <span>Subtotal</span>
        <span>{formatUsd(subtotalUsd)} / {formatBs(subtotalBs)}</span>
      </div>

      {paymentMethod === 'efectivo_usd' && IGTF_RATE > 0 && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>IGTF (3%)</span>
          <span>{formatUsd(igtfUsd)} / {formatBs(igtfBs)}</span>
        </div>
      )}

      {ivaBase > 0 && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>IVA (16%)</span>
          <span>{formatUsd(ivaUsd)} / {formatBs(ivaBs)}</span>
        </div>
      )}

      {discount && discountBs > 0 && (
        <div className="flex justify-between text-sm text-danger">
          <span className="flex items-center gap-1">
            Descuento ({discount.type === 'percentage' ? `${discount.value}%` : `$${discount.value}`})
            <button
              type="button"
              onClick={onClearDiscount}
              className="ml-1 p-0.5 rounded hover:bg-danger/10 transition-colors"
            >
              <X size={12} />
            </button>
          </span>
          <span>-{formatUsd(discountUsd)} / -{formatBs(discountBs)}</span>
        </div>
      )}

      <div className="flex justify-between text-base font-bold text-gray-900">
        <span>Total</span>
        <span>{formatUsd(totalUsd)} / {formatBs(totalBs)}</span>
      </div>

      {!discount && items.length > 0 && !showDiscountInput && (
        <button
          type="button"
          onClick={() => setShowDiscountInput(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors"
        >
          <Percent size={14} />
          Agregar descuento
        </button>
      )}

      {showDiscountInput && (
        <div className="space-y-2 p-2 rounded-xl bg-gray-50 border border-border">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDiscountType('percentage')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                discountType === 'percentage'
                  ? 'bg-primary text-white'
                  : 'bg-white text-gray-600 border border-border'
              }`}
            >
              <Percent size={12} className="inline mr-1" />
              %
            </button>
            <button
              type="button"
              onClick={() => setDiscountType('fixed')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                discountType === 'fixed'
                  ? 'bg-primary text-white'
                  : 'bg-white text-gray-600 border border-border'
              }`}
            >
              <DollarSign size={12} className="inline mr-1" />
              $
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              step={discountType === 'percentage' ? '1' : '0.01'}
              min="0"
              max={discountType === 'percentage' ? '100' : String(subtotalUsd)}
              placeholder={discountType === 'percentage' ? '0%' : '$0.00'}
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleApplyDiscount(); }}
              className="flex-1 px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            <Button variant="primary" size="sm" onClick={handleApplyDiscount}>
              Aplicar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowDiscountInput(false); setDiscountInput(''); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

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
