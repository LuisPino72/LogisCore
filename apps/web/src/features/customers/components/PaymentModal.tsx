import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Input } from '../../../common/components';
import { CreditCard, DollarSign, Smartphone, Banknote } from 'lucide-react';
import type { Customer } from '../../../specs/customers';
import type { PaymentMethod } from '../../../specs/pos';
import { PAYMENT_METHODS, METADATA_PAGOS } from '../../../specs/pos';
import { formatUsd, formatBs } from '@/lib/formatBs';
import { useExchangeRateStore } from '../../../features/exchange/stores/exchangeRateStore';
import { customerService } from '../services/customerService';
import { useToastStore } from '../../../stores/toastStore';

interface PaymentModalProps {
  customer: Customer;
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess?: () => void;
}

const PAYMENT_ICONS: Record<PaymentMethod, typeof DollarSign> = {
  efectivo_bs: Banknote,
  pago_movil: Smartphone,
  tarjeta_bs: CreditCard,
  efectivo_usd: DollarSign,
  credito: CreditCard,
};

export function PaymentModal({ customer, tenantId, isOpen, onClose, onPaymentSuccess }: PaymentModalProps) {
  const [amountUsd, setAmountUsd] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo_bs');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const exchangeRate = useExchangeRateStore((s) => s.rate) ?? 0;
  const { addToast } = useToastStore();

  // Get pending credit sales for this customer
  const [pendingSales, setPendingSales] = useState<Array<{ id: string; totalUsd: number; createdAt: string }>>([]);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && customer) {
      loadPendingSales();
      setAmountUsd('');
      setPaymentMethod('efectivo_bs');
      setReference('');
      setError('');
      setSelectedSaleId(null);
    }
  }, [isOpen, customer]);

  const loadPendingSales = async () => {
    const result = await customerService.getCustomerPendingCreditSales(customer.id, tenantId);
    if (result.ok) {
      setPendingSales(result.data.map((s) => ({
        id: s.id,
        totalUsd: s.totalUsd,
        createdAt: s.createdAt,
      })));
      // Auto-select the oldest pending sale
      if (result.data.length > 0) {
        const sorted = [...result.data].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setSelectedSaleId(sorted[0].id);
      }
    }
  };

  const handlePayAll = useCallback(() => {
    setAmountUsd(customer.balance.toFixed(2));
    setInputKey((k) => k + 1);
  }, [customer.balance]);

  const handleConfirm = async () => {
    const amount = parseFloat(amountUsd);
    if (!amount || amount <= 0) {
      setError('Ingresa un monto válido mayor a 0.');
      return;
    }

    if (amount > customer.balance) {
      setError(`El monto no puede ser mayor a la deuda (${formatUsd(customer.balance)}).`);
      return;
    }

    if (!selectedSaleId) {
      setError('Selecciona una venta para aplicar el pago.');
      return;
    }

    if (exchangeRate <= 0) {
      setError('No hay tasa de cambio disponible.');
      return;
    }

    setLoading(true);
    setError('');

    const result = await customerService.collectDebt(
      customer.id,
      selectedSaleId,
      amount,
      paymentMethod,
      tenantId,
      exchangeRate,
      reference || undefined,
    );

    setLoading(false);

    if (result.ok) {
      addToast({
        type: 'success',
        message: `Pago de ${formatUsd(amount)} registrado. Saldo: ${formatUsd(result.data.newBalance)}`,
      });
      onPaymentSuccess?.();
      onClose();
    } else {
      setError(result.error.message);
    }
  };

  const isFullPayment = parseFloat(amountUsd) >= customer.balance - 0.01;

  // Filter out 'credito' from payment methods for collection
  const collectionMethods = PAYMENT_METHODS.filter((m) => m !== 'credito') as Array<typeof PAYMENT_METHODS[number]>;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Cobrar deuda"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            className="flex-1 bg-amber-600 hover:bg-amber-700"
            onClick={handleConfirm}
            loading={loading}
            disabled={!amountUsd || parseFloat(amountUsd) <= 0 || !selectedSaleId}
          >
            {isFullPayment ? 'Pagar todo' : 'Abonar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Customer Info */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-900">{customer.name}</p>
            <p className="text-xs text-gray-500">Deuda total: {formatUsd(customer.balance)}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handlePayAll}>
            Pagar todo
          </Button>
        </div>

        {/* Pending Sales */}
        {pendingSales.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Seleccionar venta
            </label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {pendingSales.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => setSelectedSaleId(sale.id)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                    selectedSaleId === sale.id
                      ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500/30'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div>
                    <p className="text-xs font-medium text-gray-900">
                      Venta #{sale.id.slice(0, 8)}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {new Date(sale.createdAt).toLocaleDateString('es-VE')}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{formatUsd(sale.totalUsd)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Amount Input */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Monto a cobrar (USD)
          </label>
          <Input
            key={inputKey}
            type="number"
            sanitize="number"
            placeholder="0.00"
            value={amountUsd}
            onChange={(e) => { setAmountUsd(e.target.value); setError(''); }}
            error={error && (!amountUsd || parseFloat(amountUsd) <= 0) ? error : undefined}
            validation={{ required: true, min: 0.01, max: customer.balance }}
            className="text-lg font-bold"
            autoFocus
          />
          {exchangeRate > 0 && amountUsd && (
            <p className="text-xs text-gray-500 mt-1">
              ≈ {formatBs(parseFloat(amountUsd) * exchangeRate)}
            </p>
          )}
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Método de pago
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {collectionMethods.map((m) => {
              const meta = METADATA_PAGOS[m];
              const Icon = PAYMENT_ICONS[m];
              const selected = paymentMethod === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all min-h-11 active:scale-[0.98] ${
                    selected
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm ring-1 ring-amber-600/30'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300 hover:text-amber-700'
                  }`}
                >
                  <Icon size={14} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Reference (optional) */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Referencia (opcional)
          </label>
          <Input
            placeholder="Nro. transferencia, referencia..."
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            validation={{ maxLength: 50 }}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 text-center">{error}</p>
        )}
      </div>
    </Modal>
  );
}
