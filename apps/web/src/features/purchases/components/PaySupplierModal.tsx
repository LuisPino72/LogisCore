import { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
import { Button, Input, Modal, Select, Badge } from '../../../common/components';
import { usePurchaseStore } from '../stores/purchaseStore';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import { formatUsd } from '@/lib/formatBs';

interface PaySupplierModalProps {
  supplierId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tenantId: string;
}

const PAYMENT_METHODS = [
  { value: 'efectivo_bs', label: 'Efectivo Bs' },
  { value: 'efectivo_usd', label: 'Efectivo USD' },
  { value: 'pago_movil', label: 'Pago Móvil' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta_bs', label: 'Tarjeta Bs' },
  { value: 'tarjeta_usd', label: 'Tarjeta USD' },
  { value: 'deposito', label: 'Depósito' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'otro', label: 'Otro' },
];

export function PaySupplierModal({ supplierId, isOpen, onClose, onSuccess, tenantId }: PaySupplierModalProps) {
  const orders = usePurchaseStore((s) => s.orders);
  const suppliers = usePurchaseStore((s) => s.suppliers);
  const paySupplier = usePurchaseStore((s) => s.paySupplier);
  const storeError = usePurchaseStore((s) => s.error);
  const rate = useExchangeRateStore((s) => s.rate ?? 1);

  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('transferencia');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingOrders = orders.filter(
    (o) => o.supplierId === supplierId && o.status !== 'cancelled' && o.paymentStatus !== 'paid'
  );

  const supplier = suppliers.find((s) => s.id === supplierId);
  const supplierBalance = supplier?.balance ?? 0;

  const selectedOrder = pendingOrders.find((o) => o.id === selectedOrderId);
  const orderPendingAmount = selectedOrder
    ? (selectedOrder.totalUsd || 0) - (selectedOrder.paidAmountUsd || 0)
    : 0;

  useEffect(() => {
    if (!isOpen) {
      setSelectedOrderId('');
      setAmountUsd('');
      setPaymentMethod('transferencia');
      setReference('');
      setNotes('');
      setError(null);
    }
  }, [isOpen]);

  const handlePayAll = () => {
    if (orderPendingAmount > 0) {
      setAmountUsd(orderPendingAmount.toFixed(2));
    }
  };

  const handleSubmit = async () => {
    setError(null);
    const amount = parseFloat(amountUsd);
    if (!selectedOrderId) { setError('Selecciona una orden.'); return; }
    if (!amount || amount <= 0) { setError('Ingresa un monto válido.'); return; }
    if (amount > orderPendingAmount) { setError(`El monto excede el pendiente (${formatUsd(orderPendingAmount)}).`); return; }
    if (supplierBalance <= 0) { setError('Este proveedor no tiene deuda pendiente.'); return; }
    if (amount > supplierBalance) { setError(`El monto (${formatUsd(amount)}) excede la deuda del proveedor (${formatUsd(supplierBalance)}).`); return; }

    setSubmitting(true);
    const result = await paySupplier(
      supplierId,
      selectedOrderId,
      amount,
      paymentMethod,
      tenantId,
      rate,
      reference || undefined,
      notes || undefined,
    );
    setSubmitting(false);

    if (result) {
      onSuccess();
      onClose();
    } else {
      setError(storeError || 'Error al registrar el pago.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pagar a Proveedor"
      footer={
        <div className="flex gap-2 justify-end w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !selectedOrderId || !amountUsd || parseFloat(amountUsd) <= 0}
          >
            <DollarSign size={14} />
            <span className="ml-1">{submitting ? 'Procesando...' : `Pagar ${formatUsd(parseFloat(amountUsd || '0'))}`}</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="text-sm text-danger bg-danger/10 rounded-lg p-2.5">{error}</div>
        )}

        {pendingOrders.length === 0 ? (
          <p className="text-sm text-text-secondary">No hay órdenes pendientes de pago para este proveedor.</p>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Órdenes pendientes</label>
              {pendingOrders.map((o) => {
                const pending = (o.totalUsd || 0) - (o.paidAmountUsd || 0);
                const isSelected = o.id === selectedOrderId;
                return (
                  <div
                    key={o.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                    }`}
                    onClick={() => { setSelectedOrderId(o.id); setAmountUsd(''); }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">Orden #{o.id.slice(0, 8)}</p>
                      <p className="text-xs text-text-secondary">
                        Total: {formatUsd(o.totalUsd || 0)} · Pagado: {formatUsd(o.paidAmountUsd || 0)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-bold text-warning">{formatUsd(pending)}</p>
                      <Badge variant={o.paymentStatus === 'pending' ? 'warning' : 'info'}>
                        {o.paymentStatus === 'pending' ? 'Pendiente' : 'Pago Parcial'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedOrder && (
              <div className="space-y-3 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Pendiente:</span>
                  <span className="text-lg font-bold text-warning">{formatUsd(orderPendingAmount)}</span>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      label="Monto USD"
                      type="number"
                      step="0.01"
                      min="0"
                      max={orderPendingAmount}
                      value={amountUsd}
                      onChange={(e) => setAmountUsd(e.target.value)}
                      placeholder="0.00"
                      inputClassName="text-sm"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <Button variant="ghost" size="sm" onClick={handlePayAll} disabled={orderPendingAmount <= 0}>
                      Pagar Todo
                    </Button>
                  </div>
                </div>

                <Select
                  label="Método de pago"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Select>

                <Input
                  label="Referencia"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Nro. de referencia"
                  maxLength={50}
                  inputClassName="text-sm"
                />

                <Input
                  label="Notas"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas opcionales"
                  maxLength={200}
                  inputClassName="text-sm"
                />
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
