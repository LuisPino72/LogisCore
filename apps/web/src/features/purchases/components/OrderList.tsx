import { useState, useEffect } from 'react';
import { ShoppingCart, CheckCircle, Package, XCircle, Pencil, Trash2, MoreVertical, Eye } from 'lucide-react';
import { Button, Badge, EmptyState, Modal, Dropdown, Pagination } from '../../../common/components';
import type { PurchaseOrderWithItems, PurchaseOrderStatus, PurchaseOrderItem } from '../../../specs/purchases';
import { OrderReceive } from './OrderReceive';
import { formatUsd } from '@/lib/formatBs';
import { formatDate } from '../../../lib/formatDate';
import { getInitials } from '../../../lib/utils';

function getStatusBorderColor(status: PurchaseOrderStatus): string {
  switch (status) {
    case 'received': return 'border-l-success';
    case 'cancelled': return 'border-l-danger';
    case 'confirmed': return 'border-l-info';
    case 'partially_received': return 'border-l-warning';
    case 'draft': return 'border-l-gray-300';
    default: return 'border-l-gray-200';
  }
}

interface OrderListProps {
  orders: PurchaseOrderWithItems[];
  loading: boolean;
  isOwner: boolean;
  isOnline: boolean;
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

function getOrderProgress(order: PurchaseOrderWithItems): { received: number; total: number; pct: number } {
  const total = order.items.reduce((s, i) => s + i.quantity, 0);
  const received = order.items.reduce((s, i) => s + i.receivedQuantity, 0);
  const pct = total > 0 ? Math.round((received / total) * 100) : 0;
  return { received, total, pct };
}

function OrderDetailModal({ order, isOpen, onClose }: { order: PurchaseOrderWithItems | null; isOpen: boolean; onClose: () => void }) {
  if (!order) return null;
  const progress = getOrderProgress(order);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Orden #${order.id.slice(0, 8).toUpperCase()}`}>
      <div className={`space-y-4 border-l-3 ${getStatusBorderColor(order.status)}`}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">{getInitials(order.supplierName || 'SP')}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800">{order.supplierName || 'Sin proveedor'}</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={order.status} />
              <span className="text-xs text-text-secondary">{formatDate(order.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <h4 className="text-sm font-semibold mb-2">Items</h4>
          <div className="space-y-2">
            {order.items.map((item: PurchaseOrderItem) => (
              <div key={item.id} className="flex justify-between items-center text-sm bg-surface-alt rounded-lg p-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-800 truncate">{item.productName || item.productId.slice(0, 8)}</p>
                  <p className="text-xs text-text-secondary">{item.quantity} × {formatUsd(item.costUsdPerUnit)}</p>
                </div>
                <span className="font-semibold text-primary shrink-0 ml-2">{formatUsd(item.totalUsd)}</span>
              </div>
            ))}
          </div>
        </div>

        {order.notes && (
          <div className="border-t border-border pt-3">
            <h4 className="text-sm font-semibold mb-1">Notas</h4>
            <p className="text-sm text-gray-600 bg-surface-alt rounded-lg p-2">{order.notes}</p>
          </div>
        )}

        {(order.status === 'confirmed' || order.status === 'partially_received') && (
          <div className="border-t border-border pt-3 space-y-1">
            <div className="flex justify-between text-xs text-text-secondary">
              <span>Progreso de recepción</span>
              <span>{progress.received}/{progress.total} ({progress.pct}%)</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 progress-fill"
                style={{
                  width: `${Math.min(progress.pct, 100)}%`,
                  backgroundColor: progress.pct === 100 ? 'var(--color-success)' : 'var(--color-accent)',
                }}
              />
            </div>
          </div>
        )}

        <div className="border-t border-border pt-3">
          <div className="flex justify-between items-center bg-primary/5 border border-primary/10 p-3 rounded-lg">
            <span className="text-sm font-medium text-primary">Total:</span>
            <span className="text-xl font-bold text-primary">{formatUsd(order.totalUsd)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const ORDERS_PAGE_SIZE = 20;

export function OrderList({ orders, loading, isOwner, isOnline, onConfirm, onReceive, onCancel, onEdit, onDeleteOrder, tenantId }: OrderListProps) {
  const [receiveOrderId, setReceiveOrderId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<PurchaseOrderWithItems | null>(null);
  const [page, setPage] = useState(1);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (!loading && !hasLoadedOnce) setHasLoadedOnce(true);
  }, [loading, hasLoadedOnce]);

  useEffect(() => {
    setPage(1);
  }, [orders.length]);

  const totalPages = Math.max(1, Math.ceil(orders.length / ORDERS_PAGE_SIZE));
  const pagedOrders = orders.slice((page - 1) * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE);

  if (loading && orders.length === 0 && !hasLoadedOnce) {
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
        title="Todavía no hay órdenes"
        description="Crea una orden de compra para empezar a controlar tus pedidos."
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
      {pagedOrders.map((order) => {
        const progress = getOrderProgress(order);
        const isReceiving = order.status === 'confirmed' || order.status === 'partially_received';

        return (
          <div
            key={order.id}
            className={`rounded-xl border border-border bg-white overflow-hidden transition-shadow hover:shadow-md border-l-3 ${getStatusBorderColor(order.status)}`}
          >
            <div className="p-3 space-y-3">
              {/* Header: icon + info + actions */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ShoppingCart size={18} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={order.status} />
                    <span className="text-xs text-text-secondary">{formatDate(order.createdAt)}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 wrap-break-word mt-0.5">{order.supplierName || 'Sin proveedor'}</p>
                  <p className="text-base font-bold text-primary">{formatUsd(order.totalUsd)}</p>
                </div>
                {isOwner && (
                  <Dropdown
                    align="right"
                    trigger={<MoreVertical size={18} className="text-gray-500 shrink-0" />}
                    items={[
                      { label: 'Ver detalle', icon: <Eye size={16} />, onClick: () => setDetailOrder(order) },
                    ]}
                  />
                )}
              </div>

              {/* Progress bar */}
              {isReceiving && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Progreso de recepción</span>
                    <span>{progress.received}/{progress.total} ({progress.pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 progress-fill"
                      style={{
                        width: `${Math.min(progress.pct, 100)}%`,
                        backgroundColor: progress.pct === 100 ? 'var(--color-success)' : 'var(--color-accent)',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Items preview */}
              <div className="space-y-1.5 bg-gray-50/80 rounded-lg border border-gray-100 p-2.5">
                {order.items.slice(0, 3).map((item: PurchaseOrderItem) => (
                  <div key={item.id} className="flex justify-between text-xs text-gray-600">
                    <span className="truncate flex-1 mr-2 font-medium">{item.productName || item.productId.slice(0, 8)}</span>
                    <span className="shrink-0 text-text-secondary">x{item.quantity} · {formatUsd(item.totalUsd)}</span>
                  </div>
                ))}
                {order.items.length > 3 && (
                  <div className="text-[11px] text-text-secondary text-center pt-1 border-t border-gray-100/80 mt-1">
                    +{order.items.length - 3} artículos más
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {isOwner && (
                <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                    {order.status === 'draft' && (
                      <>
                        <Button variant="primary" size="sm" onClick={() => setConfirmId(order.id)} disabled={!isOnline}>
                          <CheckCircle size={14} />
                          <span className="ml-1">Confirmar</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onEdit(order)} className="shrink-0" disabled={!isOnline}>
                          <Pencil size={14} />
                        </Button>
                      </>
                    )}
                    {(order.status === 'confirmed' || order.status === 'partially_received') && (
                      <Button variant="primary" size="sm" onClick={() => setReceiveOrderId(order.id)} disabled={!isOnline}>
                        <Package size={14} />
                        <span className="ml-1">Recibir</span>
                      </Button>
                    )}
                    {(order.status === 'draft' || order.status === 'confirmed') && (
                      <Button variant="ghost" size="sm" onClick={() => onCancel(order.id, tenantId)} className="shrink-0 text-danger" disabled={!isOnline}>
                        <XCircle size={14} />
                      </Button>
                    )}
                    {order.status === 'cancelled' && (
                      <Button variant="ghost" size="sm" onClick={() => onDeleteOrder(order.id, order.supplierName ?? '')} className="text-danger" disabled={!isOnline}>
                        <Trash2 size={14} />
                        <span className="ml-1">Eliminar</span>
                      </Button>
                    )}
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
          tenantId={tenantId}
        />
      )}

      {confirmId && (
        <Modal isOpen={!!confirmId} onClose={() => setConfirmId(null)} title="Confirmar Orden">
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-4">
              ¿Estás seguro de confirmar esta orden de compra?<br />
              Una vez confirmada, podrás recibir la mercancía.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmId(null)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={async () => {
                const ok = await onConfirm(confirmId, tenantId);
                if (ok) {
                  setConfirmId(null);
                }
              }}>
                Confirmar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <OrderDetailModal order={detailOrder} isOpen={!!detailOrder} onClose={() => setDetailOrder(null)} />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
