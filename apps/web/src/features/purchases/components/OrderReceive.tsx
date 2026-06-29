import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle, Package, Truck } from 'lucide-react';
import { Button, Input, Modal } from '../../../common/components';
import { usePurchaseStore } from '../stores/purchaseStore';
import type { PurchaseOrderWithItems } from '../../../specs/purchases';
import type { Product } from '../../../specs/inventory';
import { formatUsd } from '@/lib/formatBs';
import { displayQty } from '../../inventory/types';

interface OrderReceiveProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (items: { itemId: string; receivedQuantity: number }[]) => Promise<boolean>;
  order: PurchaseOrderWithItems;
  tenantId: string;
}

export function OrderReceive({ isOpen, onClose, onSubmit, order, tenantId }: OrderReceiveProps) {
  const submittedRef = useRef(false);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
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
  const [showReceiveAllConfirm, setShowReceiveAllConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    submittedRef.current = false;
    const map: Record<string, number> = {};
    for (const item of order.items) {
      const pending = item.quantity - item.receivedQuantity;
      map[item.id] = pending > 0 ? pending : 0;
    }
    setQuantities(map);
    setError('');
    const productIds = order.items.map((i) => i.productId);
    usePurchaseStore.getState().fetchProductsForOrder(tenantId).then((res) => {
      if (res.ok) {
        const map = new Map<string, Product>();
        for (const p of res.data) {
          if (productIds.includes(p.id)) map.set(p.id, p);
        }
        setProducts(map);
      }
    });
  }, [isOpen, order.items]);

  const getProductInfo = (productId: string) => {
    const p = products.get(productId);
    if (!p) return { isWeighted: false, unit: 'Und', rawUnit: 'unidad' };
    if (p.isWeighted) {
      if (p.unit === 'lt') return { isWeighted: true, unit: 'Lt', rawUnit: p.unit };
      if (p.unit === 'm') return { isWeighted: true, unit: 'm', rawUnit: p.unit };
      return { isWeighted: true, unit: 'Kg', rawUnit: p.unit };
    }
    return { isWeighted: false, unit: 'Und', rawUnit: 'unidad' };
  };

  const handleQtyChange = (itemId: string, val: number) => {
    const item = order.items.find((i) => i.id === itemId);
    if (!item) return;
    const pending = item.quantity - item.receivedQuantity;
    const info = getProductInfo(item.productId);
    const rounded = info.isWeighted ? Math.round(val * 100) / 100 : Math.round(val);
    setQuantities({ ...quantities, [itemId]: Math.max(0, Math.min(rounded, pending)) });
  };

  const pendingItemCount = order.items.filter((i) => (i.quantity - i.receivedQuantity) > 0).length;

  const receiveAll = () => {
    const next: Record<string, number> = {};
    for (const item of order.items) {
      const pending = item.quantity - item.receivedQuantity;
      next[item.id] = pending > 0 ? pending : 0;
    }
    setQuantities(next);
    setShowReceiveAllConfirm(false);
  };

  const canReceive = order.items.some((i) => (i.quantity - i.receivedQuantity) > 0);

  const handleSubmit = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, receivedQuantity]) => ({ itemId, receivedQuantity }));

    if (items.length === 0) {
      setError('Indica al menos una cantidad recibida');
      submittedRef.current = false;
      return;
    }

    for (const item of order.items) {
      const qty = quantities[item.id] || 0;
      const pending = item.quantity - item.receivedQuantity;
      if (qty > pending) {
        setError(`Cantidad recibida excede lo pendiente para ${item.productName || 'item'}`);
        submittedRef.current = false;
        return;
      }
    }

    setSubmitting(true);
    setError('');
    const ok = await onSubmit(items);
    setSubmitting(false);
    if (!ok) {
      setError('No se pudo registrar la recepción. Revisa tu conexión e intenta de nuevo.');
      submittedRef.current = false;
    }
  };

  const handleClose = () => {
    submittedRef.current = false;
    onClose();
  };

  const totalItems = order.items.length;
  const receivedItems = order.items.filter((i) => {
    const qty = quantities[i.id] ?? 0;
    return qty >= (i.quantity - i.receivedQuantity) && (i.quantity - i.receivedQuantity) > 0;
  }).length;

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Recibir mercancía"
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="ghost" fullWidth onClick={handleClose} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Procesando...' : (
              <>
                <CheckCircle size={16} />
                <span className="ml-1">Confirmar recepción</span>
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header con gradiente */}
        <div className="rounded-lg overflow-hidden border border-primary/20">
          <div className="bg-linear-to-br from-primary/10 to-accent/5 p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Truck size={18} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 wrap-break-word">{order.supplierName || 'Sin proveedor'}</p>
                <p className="text-xs text-text-secondary">{receivedItems} de {totalItems} productos recibidos</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-primary">{formatUsd(order.totalUsd)}</p>
                <p className="text-xs text-text-secondary">Total orden</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {order.items.map((item: PurchaseOrderWithItems['items'][number]) => {
            const pending = item.quantity - item.receivedQuantity;
            const received = quantities[item.id] ?? 0;
            const pct = pending > 0 ? Math.round((received / pending) * 100) : 100;
            const isComplete = received >= pending && pending > 0;
            const info = getProductInfo(item.productId);
            const hasDecimals = info.isWeighted;

            return (
              <div key={item.id} className={`rounded-lg border p-3 space-y-2 transition-all duration-300 ${isComplete ? 'border-success/30 bg-success/5 shadow-sm' : 'border-border bg-surface-alt'}`}>
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-gray-800 truncate">{item.productName || item.productId.slice(0, 8)}</p>
                      <span className="text-xs font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded-full shrink-0">
                        {info.unit}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary">Pendiente: {displayQty(pending, info.rawUnit)}</p>
                  </div>
                  {isComplete && (
                    <span className="animate-completion-pop">
                      <CheckCircle size={20} className="text-success shrink-0 ml-2" />
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${pct < 100 ? 'progress-shimmer' : ''}`}
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: isComplete ? 'var(--color-success)' : 'var(--color-accent)',
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-text-secondary shrink-0 w-10 text-right">{pct}%</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      sanitize="number"
                      inputMode="decimal"
                      decimals={hasDecimals ? 2 : 0}
                      value={received}
                      onChange={(e) => handleQtyChange(item.id, hasDecimals ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
                      validation={{ required: true, min: 0 }}
                      inputClassName="text-sm"
                    />
                  </div>
                  <span className="text-xs text-text-secondary whitespace-nowrap shrink-0">/ {displayQty(pending, info.rawUnit)}</span>
                  {pending > 0 && received < pending && (
                    <button
                      type="button"
                      onClick={() => handleQtyChange(item.id, pending)}
                      className="text-xs text-primary font-medium shrink-0 hover:underline min-h-11 min-w-11 flex items-center justify-center"
                    >
                      Todo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {canReceive && (
          <button
            type="button"
            onClick={() => setShowReceiveAllConfirm(true)}
            className="w-full text-sm text-primary font-semibold py-3 rounded-lg border border-primary/20 bg-linear-to-r from-primary/5 to-primary/10 hover:from-primary/10 hover:to-primary/15 transition-all duration-200 min-h-11 hover:shadow-sm active:scale-[0.98]"
          >
            <Package size={14} className="inline mr-1.5 -mt-0.5" />
            Recibir todo lo pendiente
          </button>
        )}

        {error && (
          <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>

    <Modal
      isOpen={showReceiveAllConfirm}
      onClose={() => setShowReceiveAllConfirm(false)}
      title="¿Recibir todo?"
      size="sm"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="secondary" fullWidth onClick={() => setShowReceiveAllConfirm(false)}>
            Cancelar
          </Button>
          <Button variant="primary" fullWidth onClick={receiveAll}>
            <CheckCircle size={16} />
            <span className="ml-1">Confirmar</span>
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-primary/20 bg-primary/10">
          <AlertTriangle size={24} className="text-primary" />
        </div>
        <p className="text-sm text-gray-600 text-center">
          Se marcarán <strong>{pendingItemCount} item(s)</strong> como recibido(s) completamente.
        </p>
      </div>
    </Modal>
    </>
  );
}
