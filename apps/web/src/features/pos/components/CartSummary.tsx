import { useState } from 'react';
import { Button, Input } from '../../../common/components';
import { ShoppingCart, Pause, Percent, DollarSign, X, User, UserPlus } from 'lucide-react';
import type { CartItem, PaymentMethod } from '../types';
import { METADATA_PAGOS, PAYMENT_METHODS, calculateSaleTotals } from '../../../specs/pos';
import { IGTF_RATE } from '@logiscore/shared';
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
  selectedCustomer: { id: string; name: string; cedula?: string; phone?: string; address?: string; creditLimit: number; balance: number; notes?: string; createdAt: string; updatedAt: string; deletedAt?: string } | null;
  onSelectCustomer: () => void;
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
  selectedCustomer,
  onSelectCustomer,
}: CartSummaryProps) {
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountInput, setDiscountInput] = useState('');
  const [discountError, setDiscountError] = useState('');

  const totals = calculateSaleTotals(items, exchangeRateBs, paymentMethod ?? '', discount);
  const { subtotalUsd, subtotalBs, igtfBs, ivaBs, discountBs, discountUsd, totalBs, totalUsd, ivaUsd } = totals;
  const ivaBase = totals.ivaBase;

  const igtfUsd = paymentMethod === 'efectivo_usd' && IGTF_RATE > 0 && exchangeRateBs > 0 ? (igtfBs / exchangeRateBs) : 0;

  const handleApplyDiscount = () => {
    const val = parseFloat(discountInput);
    if (!val || val <= 0) {
      setDiscountError('El descuento debe ser mayor a 0.');
      return;
    }
    if (discountType === 'percentage' && val > 100) {
      setDiscountError('El descuento porcentual no puede ser mayor a 100%.');
      return;
    }
    if (discountType === 'fixed' && val > subtotalUsd) {
      setDiscountError('El descuento no puede ser mayor al subtotal.');
      return;
    }
    onSetDiscount(discountType, val);
    setShowDiscountInput(false);
    setDiscountInput('');
    setDiscountError('');
  };

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <div className="flex justify-between text-sm text-gray-600">
        <span>Subtotal</span>
        <span>{formatUsd(subtotalUsd)} / {formatBs(subtotalBs)}</span>
      </div>

      {paymentMethod === 'efectivo_usd' && IGTF_RATE > 0 && (
        <div className="flex justify-between text-sm text-gray-600">
          {/* AUDIT-FLOW-2-003: porcentaje derivado de IGTF_RATE (Regla #8), no hardcoded. */}
          <span>IGTF ({(IGTF_RATE * 100).toFixed(0)}%)</span>
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

      {selectedCustomer ? (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
          <User size={14} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">
              {selectedCustomer.cedula || selectedCustomer.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onSelectCustomer}
            className="text-[10px] font-medium text-primary hover:text-primary-dark px-1.5 py-0.5 rounded-md hover:bg-primary/10 transition-colors shrink-0"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSelectCustomer}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-text-secondary border border-border hover:border-primary/30 hover:text-primary transition-colors"
        >
          <UserPlus size={14} />
          Asignar cliente
        </button>
      )}

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
              Porcentaje
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
             Dólares
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
            {discountError && <p className="text-xs text-danger">{discountError}</p>}
            <Button variant="primary" size="sm" onClick={handleApplyDiscount}>
              Aplicar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowDiscountInput(false); setDiscountInput(''); setDiscountError(''); }}>
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
