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

export function OrderList({ orders, loading, isOwner, onConfirm, onReceive, onCancel, onEdit, onDeleteOrder, tenantId }: OrderListProps) {
  const [receiveOrderId, setReceiveOrderId] = useState<string | null>(null);

  if (loading && orders.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
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
      {orders.map((order) => (
        <div key={order.id} className="p-3 rounded-xl border border-border bg-white space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
              <span className="text-xs text-gray-400">{order.supplierName || 'Sin proveedor'}</span>
            </div>
            <span className="text-sm font-bold text-primary">$ {order.totalUsd.toFixed(2)}</span>
          </div>

          <div className="space-y-1">
            {order.items.map((item: PurchaseOrderItem) => (
              <div key={item.id} className="flex justify-between text-xs text-gray-600">
                <span>{item.productName || item.productId.slice(0, 8)} x {item.quantity} {item.productName ? '' : ''}</span>
                <span>$ {item.totalUsd.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {isOwner && order.status !== 'received' && (
            <div className="flex gap-2 pt-1">
              {order.status === 'draft' && (
                <>
                  <Button variant="primary" size="sm" fullWidth onClick={() => onConfirm(order.id, tenantId)}>
                    <CheckCircle size={14} />
                    <span className="ml-1">Confirmar</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(order)}>
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
                <Button variant="ghost" size="sm" onClick={() => onCancel(order.id, tenantId)} className="text-danger">
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
      ))}

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
