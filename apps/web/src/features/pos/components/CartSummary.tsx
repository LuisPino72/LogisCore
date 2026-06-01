import { useState } from 'react';
import { Button, Input } from '../../../common/components';
import { ShoppingCart, Pause, Percent, DollarSign, X } from 'lucide-react';
import type { CartItem, PaymentMethod } from '../types';
import { METADATA_PAGOS, PAYMENT_METHODS, calculateSaleTotals, IGTF_RATE } from '../../../specs/pos';
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

  const totals = calculateSaleTotals(items, exchangeRateBs, paymentMethod ?? '', discount);
  const { subtotalUsd, subtotalBs, igtfBs, ivaBs, discountBs, discountUsd, totalBs, totalUsd, ivaUsd } = totals;
  const ivaBase = totals.ivaBase;

  const igtfUsd = paymentMethod === 'efectivo_usd' && IGTF_RATE > 0 && exchangeRateBs > 0 ? (igtfBs / exchangeRateBs) : 0;

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
        <div className="space-y-2 p-2 rounded-xl bg-surface-alt border border-border shadow-sm">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDiscountType('percentage')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                discountType === 'percentage'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-border hover:border-primary/30'
              }`}
            >
              <Percent size={12} className="inline mr-1" />
              %
            </button>
            <button
              type="button"
              onClick={() => setDiscountType('fixed')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                discountType === 'fixed'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-border hover:border-primary/30'
              }`}
            >
              <DollarSign size={12} className="inline mr-1" />
              $
            </button>
          </div>
          <div className="flex gap-2">
            <Input
              sanitize="number"
              placeholder={discountType === 'percentage' ? '0%' : '$0.00'}
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleApplyDiscount(); }}
              className="flex-1"
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
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all min-h-11 active:scale-[0.97] ${
                selected
                  ? 'bg-primary text-white border-primary shadow-sm ring-1 ring-primary/30'
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
