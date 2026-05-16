import { useState } from 'react';
import { ShoppingCart, CheckCircle, Package, XCircle, Pencil, Trash2 } from 'lucide-react';
import { Button, Badge, EmptyState } from '../../../common/components';
import type { PurchaseOrderWithItems, PurchaseOrderStatus, PurchaseOrderItem } from '../../../specs/purchases';
import { OrderReceive } from './OrderReceive';

interface OrderListProps {
  orders: PurchaseOrderWithItems[];
  loading: boolean;
  isOwner: boolean;
  onConfirm: (id: string, tenantId: string) => Promise<boolean>;
  onReceive: (id: string, items: { itemId: string; receivedQuantity: number }[]) => Promise<boolean>;
  onCancel: (id: string, tenantId: string) => void;
  onEdit: (order: PurchaseOrderWithItems) => void;
  onDeleteOrder: (id: string, name: string) => void;
  onRefresh: () => void;
  tenantId: string;
}

const STATUS_LABELS: Record<PurchaseOrderStatus, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }> = {
  draft: { label: 'Borrador', variant: 'warning' },
  confirmed: { label: 'Confirmada', variant: 'info' },
  partially_received: { label: 'Parcial', variant: 'warning' },
  received: { label: 'Recibida', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const cfg = STATUS_LABELS[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
}

function getOrderProgress(order: PurchaseOrderWithItems): { received: number; total: number; pct: number } {
  const total = order.items.reduce((s, i) => s + i.quantity, 0);
  const received = order.items.reduce((s, i) => s + i.receivedQuantity, 0);
  const pct = total > 0 ? Math.round((received / total) * 100) : 0;
  return { received, total, pct };
}

export function OrderList({ orders, loading, isOwner, onConfirm, onReceive, onCancel, onEdit, onDeleteOrder, tenantId }: OrderListProps) {
  const [receiveOrderId, setReceiveOrderId] = useState<string | null>(null);

  if (loading && orders.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart size={32} />}
        title="Sin órdenes"
        description="Crea tu primera orden de compra."
      />
    );
  }

  const handleReceive = async (items: { itemId: string; receivedQuantity: number }[]) => {
    if (!receiveOrderId) return false;
    const ok = await onReceive(receiveOrderId, items);
    if (ok) setReceiveOrderId(null);
    return ok;
  };

  const receivingOrder = orders.find((o) => o.id === receiveOrderId);

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const progress = getOrderProgress(order);
        const initials = getInitials(order.supplierName || 'SP');
        const isReceiving = order.status === 'confirmed' || order.status === 'partially_received';

        return (
          <div
            key={order.id}
            className="rounded-xl border border-border bg-white overflow-hidden transition-shadow hover:shadow-md"
          >
            <div className="p-3 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={order.status} />
                    <span className="text-xs text-text-secondary">{formatDate(order.createdAt)}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 mt-1 truncate">
                    {order.supplierName || 'Sin proveedor'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-bold text-primary">$ {order.totalUsd.toFixed(2)}</p>
                </div>
              </div>

              {isReceiving && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Progreso de recepción</span>
                    <span>{progress.received}/{progress.total} ({progress.pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${progress.pct}%`,
                        backgroundColor: progress.pct === 100 ? 'var(--color-success)' : 'var(--color-accent)',
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1 bg-gray-50 rounded-lg p-2">
                {order.items.slice(0, 3).map((item: PurchaseOrderItem) => (
                  <div key={item.id} className="flex justify-between text-xs text-gray-600">
                    <span className="truncate flex-1 mr-2">{item.productName || item.productId.slice(0, 8)}</span>
                    <span className="shrink-0">x{item.quantity} — $ {item.totalUsd.toFixed(2)}</span>
                  </div>
                ))}
                {order.items.length > 3 && (
                  <p className="text-xs text-text-secondary text-center">+{order.items.length - 3} items más</p>
                )}
              </div>

              {isOwner && order.status !== 'received' && (
                <div className="flex gap-2 pt-1">
                  {order.status === 'draft' && (
                    <>
                      <Button variant="primary" size="sm" fullWidth onClick={() => onConfirm(order.id, tenantId)}>
                        <CheckCircle size={14} />
                        <span className="ml-1">Confirmar</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onEdit(order)} className="shrink-0">
                        <Pencil size={14} />
                      </Button>
                    </>
                  )}
                  {(order.status === 'confirmed' || order.status === 'partially_received') && (
                    <Button variant="primary" size="sm" fullWidth onClick={() => setReceiveOrderId(order.id)}>
                      <Package size={14} />
                      <span className="ml-1">Recibir</span>
                    </Button>
                  )}
                  {(order.status === 'draft' || order.status === 'confirmed') && (
                    <Button variant="ghost" size="sm" onClick={() => onCancel(order.id, tenantId)} className="shrink-0 text-danger">
                      <XCircle size={14} />
                    </Button>
                  )}
                </div>
              )}
              {isOwner && order.status === 'cancelled' && (
                <div className="flex pt-1">
                  <Button variant="ghost" size="sm" fullWidth onClick={() => onDeleteOrder(order.id, order.supplierName ?? '')} className="text-danger">
                    <Trash2 size={14} />
                    <span className="ml-1">Eliminar</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {receivingOrder && (
        <OrderReceive
          isOpen={true}
          onClose={() => setReceiveOrderId(null)}
          onSubmit={handleReceive}
          order={receivingOrder}
        />
      )}
    </div>
  );
}
