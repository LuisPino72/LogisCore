import { useState } from 'react';
import { Button, Input } from '../../../common/components';
import { ShoppingCart, Pause, Percent, DollarSign, X, User, UserPlus, CreditCard, Info, Lock } from 'lucide-react';
import type { CartItem, PaymentMethod } from '../types';
import { METADATA_PAGOS, PAYMENT_METHODS, calculateSaleTotals } from '../../../specs/pos';
import { IGTF_RATE } from '@logiscore/shared';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { useToastStore } from '../../../stores/toastStore';

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
  onClearCustomer: () => void;
  isCreditSale: boolean;
  onSetIsCreditSale: (isCredit: boolean) => void;
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
  onClearCustomer,
  isCreditSale,
  onSetIsCreditSale,
}: CartSummaryProps) {
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountInput, setDiscountInput] = useState('');
  const [discountError, setDiscountError] = useState('');
  const [showCreditInfo, setShowCreditInfo] = useState(false);
  const { addToast } = useToastStore();

  const totals = calculateSaleTotals(items, exchangeRateBs, paymentMethod ?? '', discount);
  const { subtotalUsd, subtotalBs, igtfBs, ivaBs, discountBs, discountUsd, totalBs, totalUsd, ivaUsd } = totals;
  const ivaBase = totals.ivaBase;

  const igtfUsd = paymentMethod === 'efectivo_usd' && IGTF_RATE > 0 && exchangeRateBs > 0 ? (igtfBs / exchangeRateBs) : 0;

  const hasCustomerWithCredit = selectedCustomer && selectedCustomer.creditLimit > 0;
  const availableCredit = selectedCustomer ? Math.max(0, selectedCustomer.creditLimit - selectedCustomer.balance) : 0;
  const creditExceeds = isCreditSale && selectedCustomer ? totalUsd > availableCredit : false;

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

  const handleCreditToggle = () => {
    if (isCreditSale) {
      onSetIsCreditSale(false);
      onPaymentMethodChange('efectivo_bs');
    } else {
      if (!selectedCustomer) {
        addToast({ type: 'warning', message: 'Selecciona un cliente primero' });
        return;
      }
      onSetIsCreditSale(true);
      onPaymentMethodChange('credito');
    }
  };

  // Filter payment methods: show credit only if customer has credit, exclude 'credito' from normal grid
  const normalPaymentMethods = PAYMENT_METHODS.filter((m) => m !== 'credito') as Array<typeof PAYMENT_METHODS[number]>;

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <div className="flex justify-between min-w-0 flex-wrap text-sm text-gray-600">
        <span>Subtotal</span>
        <span className="min-w-0 text-right">{formatUsd(subtotalUsd)} / {formatBs(subtotalBs)}</span>
      </div>

      {paymentMethod === 'efectivo_usd' && IGTF_RATE > 0 && (
        <div className="flex justify-between min-w-0 flex-wrap text-sm text-gray-600">
          <span className="flex items-center gap-1.5">IGTF <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded-full font-medium">{(IGTF_RATE * 100).toFixed(0)}%</span></span>
          <span className="min-w-0 text-right">{formatUsd(igtfUsd)} / {formatBs(igtfBs)}</span>
        </div>
      )}

      {ivaBase > 0 && (
        <div className="flex justify-between text-sm text-gray-600">
          <span className="flex items-center gap-1.5">IVA <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded-full font-medium">16%</span></span>
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
              className="ml-1 p-2 min-w-11 min-h-11 rounded hover:bg-danger/10 transition-colors flex items-center justify-center"
            >
              <X size={12} />
            </button>
          </span>
          <span>-{formatUsd(discountUsd)} / -{formatBs(discountBs)}</span>
        </div>
      )}

      <div className="flex justify-between min-w-0 flex-wrap text-base font-bold text-gray-900">
        <span>Total</span>
        <span key={totalUsd} className="min-w-0 text-right animate-count-pop">{formatUsd(totalUsd)} / {formatBs(totalBs)}</span>
      </div>

      {selectedCustomer ? (
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
          <User size={14} className="text-primary shrink-0" />
          <p className="text-xs font-medium text-gray-900 truncate">
            {selectedCustomer.cedula || selectedCustomer.name}
          </p>
          {hasCustomerWithCredit && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowCreditInfo(!showCreditInfo)}
                className="p-1.5 rounded-md hover:bg-primary/10 transition-colors text-primary flex items-center justify-center"
              >
                <Info size={13} />
              </button>
              {showCreditInfo && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
                  <p className="text-xs font-medium text-gray-900 mb-1">Crédito</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Límite:</span>
                      <span className="font-medium">{formatUsd(selectedCustomer.creditLimit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Deuda actual:</span>
                      <span className="font-medium">{formatUsd(selectedCustomer.balance)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1">
                      <span className="text-gray-500">Disponible:</span>
                      <span className="font-medium text-success">{formatUsd(availableCredit)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
           <button
            type="button"
            onClick={onSelectCustomer}
            className="text-xs font-medium text-primary hover:text-primary-dark px-2 py-1 rounded-md hover:bg-primary/10 transition-colors flex items-center justify-center shrink-0"
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={onClearCustomer}
            className="p-1.5 rounded-md hover:bg-danger/10 transition-colors text-gray-800 hover:text-danger flex items-center justify-center shrink-0"
            aria-label="Quitar cliente"
          >
            <X size={14} />
          </button>
         
        </div>
      ) : (
        <button
          type="button"
          onClick={onSelectCustomer}
          className="w-full flex items-center justify-center gap-1.5 py-2 min-h-11 rounded-xl text-xs font-medium text-text-secondary border border-border hover:border-primary/30 hover:text-primary transition-colors"
        >
          <UserPlus size={14} />
          Asignar cliente
        </button>
      )}

      {!discount && items.length > 0 && !showDiscountInput && (
        <button
          type="button"
          onClick={() => setShowDiscountInput(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 min-h-11 rounded-xl text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors"
        >
          <Percent size={14} />
          Agregar descuento
        </button>
      )}

      {showDiscountInput && (
        <div className="space-y-2 p-2 rounded-xl bg-surface-alt border border-border shadow-sm animate-slide-down-panel">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDiscountType('percentage')}
              className={`flex-1 py-1.5 min-h-11 rounded-lg text-xs font-medium transition-all active:scale-[0.98] ${
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
              className={`flex-1 py-1.5 min-h-11 rounded-lg text-xs font-medium transition-all active:scale-[0.98] ${
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
              inputMode="decimal"
              placeholder={discountType === 'percentage' ? '0%' : '$0.00'}
              value={discountInput}
              onChange={(e) => { setDiscountInput(e.target.value); setDiscountError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleApplyDiscount(); }}
              error={discountError || undefined}
              validation={{ required: true, min: 0.01 }}
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {normalPaymentMethods.map((m) => {
          const meta = METADATA_PAGOS[m];
          const selected = paymentMethod === m && !isCreditSale;
          return (
            <button
              key={m}
              type="button"
              onClick={() => { onPaymentMethodChange(m); onSetIsCreditSale(false); }}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all min-h-11 active:scale-[0.98] ${
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

      {hasCustomerWithCredit && (
        <button
          type="button"
          onClick={handleCreditToggle}
          disabled={creditExceeds}
          className={`w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all min-h-11 active:scale-[0.98] ${
            isCreditSale
              ? 'bg-amber-500 text-white border-amber-500 shadow-sm ring-1 ring-amber-500/30'
              : creditExceeds
                ? 'bg-gray-100 text-gray-400 border-border cursor-not-allowed'
                : 'bg-white text-amber-700 border-amber-300 hover:border-amber-500 hover:bg-amber-50'
          }`}
        >
          <CreditCard size={14} />
          A crédito
          {isCreditSale && (
            <span className="ml-1 text-xs opacity-80">
              ({formatUsd(totalUsd)})
            </span>
          )}
        </button>
      )}

      {creditExceeds && (
        <p className="text-xs text-danger text-center">
          Excede crédito disponible ({formatUsd(availableCredit)})
        </p>
      )}

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
          variant={isCreditSale ? 'ghost-danger' : isOpen ? 'primary' : 'ghost'}
          className="flex-2 min-h-11"
          disabled={!isOpen || items.length === 0 || !paymentMethod || exchangeRateBs <= 0 || creditExceeds}
          loading={loading}
          onClick={onPay}
        >
          {isCreditSale ? <CreditCard size={16} /> : isOpen ? <ShoppingCart size={16} /> : <Lock size={16} />}
          {isCreditSale ? 'Fiado' : isOpen ? 'Pagar' : 'Caja cerrada'}
        </Button>
      </div>
    </div>
  );
}
