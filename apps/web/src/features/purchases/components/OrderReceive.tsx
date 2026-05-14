import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { Button, Input, Modal } from '../../../common/components';
import type { PurchaseOrderWithItems } from '../../../specs/purchases';

interface OrderReceiveProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (items: { itemId: string; receivedQuantity: number }[]) => Promise<boolean>;
  order: PurchaseOrderWithItems;
}

export function OrderReceive({ isOpen, onClose, onSubmit, order }: OrderReceiveProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const item of order.items) {
      const pending = item.quantity - item.receivedQuantity;
      map[item.id] = pending > 0 ? pending : 0;
    }
    return map;
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleQtyChange = (itemId: string, val: number) => {
    setQuantities({ ...quantities, [itemId]: Math.max(0, val) });
  };

  const handleSubmit = async () => {
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, receivedQuantity]) => ({ itemId, receivedQuantity }));

    if (items.length === 0) {
      setError('Indica al menos una cantidad recibida');
      return;
    }

    // Validar que no exceda lo pendiente
    for (const item of order.items) {
      const qty = quantities[item.id] || 0;
      const pending = item.quantity - item.receivedQuantity;
      if (qty > pending) {
        setError(`Cantidad recibida excede lo pendiente para item`);
        return;
      }
    }

    setSubmitting(true);
    setError('');
    const ok = await onSubmit(items);
    setSubmitting(false);
    if (!ok) {
      setError('Error al recibir mercancía');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recibir mercancía">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Orden: <strong>{order.supplierName || 'Sin proveedor'}</strong>
        </p>

        <div className="space-y-3">
          {order.items.map((item: PurchaseOrderWithItems['items'][number]) => {
            const pending = item.quantity - item.receivedQuantity;
            const received = quantities[item.id] ?? 0;
            return (
              <div key={item.id} className="p-3 bg-gray-50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{item.productId.slice(0, 8)}...</span>
                  <span className="text-gray-500">Pendiente: {pending}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max={pending}
                    value={received}
                    onChange={(e) => handleQtyChange(item.id, parseInt(e.target.value) || 0)}
                    inputClassName="text-sm px-2 py-1"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">/ {item.quantity}</span>
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Procesando...' : (
              <>
                <CheckCircle size={16} />
                <span className="ml-1">Confirmar recepción</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
