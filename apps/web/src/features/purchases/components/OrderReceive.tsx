import { useState } from 'react';
import { CheckCircle, Package } from 'lucide-react';
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

  const receiveAll = () => {
    const next: Record<string, number> = {};
    for (const item of order.items) {
      const pending = item.quantity - item.receivedQuantity;
      next[item.id] = pending > 0 ? pending : 0;
    }
    setQuantities(next);
  };

  const handleSubmit = async () => {
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, receivedQuantity]) => ({ itemId, receivedQuantity }));

    if (items.length === 0) {
      setError('Indica al menos una cantidad recibida');
      return;
    }

    for (const item of order.items) {
      const qty = quantities[item.id] || 0;
      const pending = item.quantity - item.receivedQuantity;
      if (qty > pending) {
        setError(`Cantidad recibida excede lo pendiente para ${item.productName || 'item'}`);
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

  const totalItems = order.items.length;
  const receivedItems = order.items.filter((i) => {
    const qty = quantities[i.id] ?? 0;
    return qty >= (i.quantity - i.receivedQuantity) && (i.quantity - i.receivedQuantity) > 0;
  }).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recibir mercancía">
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
          <Package size={18} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary truncate">{order.supplierName || 'Sin proveedor'}</p>
            <p className="text-xs text-text-secondary">{receivedItems} de {totalItems} items completados</p>
          </div>
        </div>

        <div className="space-y-3">
          {order.items.map((item: PurchaseOrderWithItems['items'][number]) => {
            const pending = item.quantity - item.receivedQuantity;
            const received = quantities[item.id] ?? 0;
            const pct = pending > 0 ? Math.round((received / pending) * 100) : 100;
            const isComplete = received >= pending && pending > 0;

            return (
              <div key={item.id} className={`rounded-lg border p-3 space-y-2 transition-colors ${isComplete ? 'border-success/30 bg-success/5' : 'border-border bg-surface-alt'}`}>
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.productName || item.productId.slice(0, 8)}</p>
                    <p className="text-xs text-text-secondary">Pendiente: {pending} unidades</p>
                  </div>
                  {isComplete && (
                    <CheckCircle size={16} className="text-success shrink-0 ml-2" />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: isComplete ? 'var(--color-success)' : 'var(--color-accent)',
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-text-secondary shrink-0 w-10 text-right">{pct}%</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      max={pending}
                      value={received}
                      onChange={(e) => handleQtyChange(item.id, parseInt(e.target.value) || 0)}
                      inputClassName="text-sm"
                    />
                  </div>
                  <span className="text-xs text-text-secondary whitespace-nowrap shrink-0">/ {item.quantity}</span>
                  {pending > 0 && received < pending && (
                    <button
                      type="button"
                      onClick={() => handleQtyChange(item.id, pending)}
                      className="text-xs text-primary font-medium shrink-0 hover:underline"
                    >
                      Todo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {order.items.some((i) => (i.quantity - i.receivedQuantity) > 0) && (
          <button
            type="button"
            onClick={receiveAll}
            className="w-full text-sm text-primary font-medium py-2 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            Recibir todo lo pendiente
          </button>
        )}

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
