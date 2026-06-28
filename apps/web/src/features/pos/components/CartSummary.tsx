import { memo, useState, useMemo } from 'react';
import { Button, Input } from '@/common/components';
import { ShoppingCart, Pause, Percent, DollarSign, X, User, UserPlus, CreditCard, Info, Lock } from 'lucide-react';
import type { CartItem, PaymentMethod } from '../types';
import type { Customer } from '../../../specs/customers';
import { METADATA_PAGOS, PAYMENT_METHODS, calculateSaleTotals } from '../../../specs/pos';
import { preciseRound } from '@logiscore/shared';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { useToastStore } from '../../../stores/toastStore';
import { usePosStore } from '../stores/posStore';
import { useAuthStore } from '../../../features/auth/stores/authStore';
import { hasActionPermission } from '../../../features/auth/permissions/rolePermissions';

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
  selectedCustomer: Customer | null;
  onSelectCustomer: () => void;
  onClearCustomer: () => void;
  isCreditSale: boolean;
  onSetIsCreditSale: (isCredit: boolean) => void;
}

export const CartSummary = memo(function CartSummary({
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
  const { ivaRate, igtfRate, igtfEnabled, maxDiscountPct } = useSettingsStore();
  const activeParkedCartId = usePosStore((s) => s.activeParkedCartId);
  const session = useAuthStore((s) => s.session);
  const canApplyDiscount = hasActionPermission(session, 'pos', 'apply_discount');

  const totals = useMemo(
    () => calculateSaleTotals(items, exchangeRateBs, paymentMethod ?? '', discount, {
      ivaRate,
      igtfRate: igtfEnabled ? igtfRate : 0,
    }),
    [items, exchangeRateBs, paymentMethod, discount, ivaRate, igtfRate, igtfEnabled],
  );
  const { subtotalUsd, subtotalBs, igtfBs, ivaBs, discountBs, discountUsd, totalBs, totalUsd, ivaUsd } = totals;
  const ivaBase = totals.ivaBase;

  const activeIgtfRate = igtfEnabled ? igtfRate : 0;
  const igtfUsd = paymentMethod === 'efectivo_usd' && activeIgtfRate > 0 && exchangeRateBs > 0 ? preciseRound(igtfBs / exchangeRateBs, 4) : 0;

  const hasCustomerWithCredit = selectedCustomer && selectedCustomer.creditLimit > 0;
  const availableCredit = selectedCustomer ? Math.max(0, selectedCustomer.creditLimit - selectedCustomer.balance) : 0;
  const creditExceeds = isCreditSale && selectedCustomer ? totalUsd > availableCredit : false;

  const handleApplyDiscount = () => {
    const val = parseFloat(discountInput);
    if (!val || val <= 0) {
      setDiscountError('El descuento debe ser mayor a 0.');
      return;
    }
    if (discountType === 'percentage' && val > maxDiscountPct) {
      setDiscountError(`El descuento máximo permitido es ${maxDiscountPct}%.`);
      return;
    }
    if (discountType === 'fixed') {
      const pctOfSubtotal = subtotalUsd > 0 ? (val / subtotalUsd) * 100 : 0;
      if (pctOfSubtotal > maxDiscountPct) {
        setDiscountError(`El descuento máximo permitido es ${maxDiscountPct}% del subtotal.`);
        return;
      }
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

      {paymentMethod === 'efectivo_usd' && activeIgtfRate > 0 && (
        <div className="flex justify-between min-w-0 flex-wrap text-sm text-gray-600">
          <span className="flex items-center gap-1.5">IGTF <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded-full font-medium">{(activeIgtfRate * 100).toFixed(0)}%</span></span>
          <span className="min-w-0 text-right">{formatUsd(igtfUsd)} / {formatBs(igtfBs)}</span>
        </div>
      )}

      {ivaBase > 0 && (
        <div className="flex justify-between text-sm text-gray-600">
          <span className="flex items-center gap-1.5">IVA <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded-full font-medium">{(ivaRate * 100).toFixed(0)}%</span></span>
          <span>{formatUsd(ivaUsd)} / {formatBs(ivaBs)}</span>
        </div>
      )}

      {discount && discountBs > 0 && (
        <div className="flex justify-between text-sm text-danger">
          <span className="flex items-center gap-1">
            Descuento ({discount.type === 'percentage' ? `${discount.value}%` : `$${discount.value}`})
            {canApplyDiscount && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearDiscount}
                className="ml-1 p-2 min-w-11 min-h-11 rounded text-danger"
                aria-label="Quitar descuento"
              >
                <X size={12} />
              </Button>
            )}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreditInfo(!showCreditInfo)}
                className="p-1.5 rounded-md"
                aria-label="Información de crédito"
              >
                <Info size={13} />
              </Button>
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
           <Button
            variant="ghost"
            size="sm"
            onClick={onSelectCustomer}
            className="text-xs font-medium text-primary px-2 py-1 rounded-md"
          >
            Cambiar
          </Button>
          <Button
            variant="ghost-danger"
            size="sm"
            onClick={onClearCustomer}
            className="p-1.5 rounded-md"
            aria-label="Quitar cliente"
          >
            <X size={14} />
          </Button>
         
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onSelectCustomer}
          className="w-full min-h-11"
        >
          <UserPlus size={14} />
          Asignar cliente
        </Button>
      )}

      {!discount && items.length > 0 && !showDiscountInput && canApplyDiscount && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDiscountInput(true)}
          className="w-full min-h-11"
        >
          <Percent size={14} />
          Agregar descuento
        </Button>
      )}

      {showDiscountInput && (
        <div className="space-y-2 p-2 rounded-xl bg-surface-alt border border-border shadow-sm animate-slide-down-panel">
          <div className="flex gap-1">
            <Button
              variant={discountType === 'percentage' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setDiscountType('percentage')}
              className="flex-1 min-h-11 text-xs"
            >
              <Percent size={12} className="mr-1" />
              Porcentaje
            </Button>
            <Button
              variant={discountType === 'fixed' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setDiscountType('fixed')}
              className="flex-1 min-h-11 text-xs"
            >
              <DollarSign size={12} className="mr-1" />
              Dólares
            </Button>
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
            <Button
              key={m}
              variant={selected ? 'primary' : 'outline'}
              size="sm"
              onClick={() => { onPaymentMethodChange(m); onSetIsCreditSale(false); }}
              className="min-h-11"
            >
              {meta.label}
            </Button>
          );
        })}
      </div>

      {hasCustomerWithCredit && (
        <Button
          variant={isCreditSale ? 'primary' : 'outline'}
          onClick={handleCreditToggle}
          disabled={creditExceeds}
          className="w-full min-h-11"
          // TECH DEBT: inline style ámbar para botón crédito. Refactor: className con variable de diseño.
          style={isCreditSale ? { backgroundColor: '#f59e0b', borderColor: '#f59e0b' } : undefined}
        >
          <CreditCard size={14} />
          A crédito
          {isCreditSale && (
            <span className="ml-1 text-xs opacity-80">
              ({formatUsd(totalUsd)})
            </span>
          )}
        </Button>
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
          disabled={items.length === 0 || !!activeParkedCartId}
          onClick={onPark}
        >
          <Pause size={16} />
          {activeParkedCartId ? 'Ya pausada' : 'Pausar'}
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
});
