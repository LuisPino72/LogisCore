import { Modal, Input, Button } from '../../../common/components';
import { useState } from 'react';
import type { Product } from '../../../specs/inventory';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  product: Product | null;
  quantity: string;
  onQuantityChange: (qty: string) => void;
}

export function PaymentModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  product,
  quantity,
  onQuantityChange,
}: PaymentModalProps) {
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      setError('Ingrese una cantidad valida.');
      return;
    }
    setError('');
    onConfirm();
  };

  if (!product) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agregar producto pesable">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">
          {product.name} ({product.sku})
        </p>

        <Input
          label={`Cantidad (${product.unit})`}
          type="number"
          inputMode="decimal"
          step="0.01"
          value={quantity}
          onChange={(e) => {
            setError('');
            onQuantityChange(e.target.value);
          }}
          error={error}
          validation={{ required: 'Ingresa la cantidad', min: 0.01, max: 999 }}
          placeholder="0.00"
        />

        {quantity && parseFloat(quantity) > 0 && (
          <div className="text-sm text-gray-600 bg-surface-alt rounded-lg p-2">
            Total: $ {(parseFloat(quantity) * product.priceUsd).toFixed(2)}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleConfirm} loading={loading}>
            Agregar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
