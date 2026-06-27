import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Flame, Clock, Volume2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/common/components';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import type { KitchenOrderView } from '../hooks/useKitchenOrders';

const NOOP = () => {};

function formatTime(): string {
  return new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

const OrderCard = React.memo(function OrderCard({
  order,
  onStart,
  onReady,
  onRevert,
}: {
  order: KitchenOrderView;
  onStart: (id: string) => void;
  onReady: (id: string) => void;
  onRevert: (id: string) => void;
}) {
  const handleStart = useCallback(() => onStart(order.id), [onStart, order.id]);
  const handleReady = useCallback(() => onReady(order.id), [onReady, order.id]);
  const handleRevert = useCallback(() => onRevert(order.id), [onRevert, order.id]);
  const [expanded, setExpanded] = useState(false);

  const borderColor =
    order.status === 'pedida' ? 'border-l-amber-400' :
    order.status === 'preparacion' ? 'border-l-blue-500' :
    'border-l-green-500';

  const statusLabel =
    order.status === 'pedida' ? 'Pendiente' :
    order.status === 'preparacion' ? 'Preparación' :
    'Lista';

  const statusVariant =
    order.status === 'pedida' ? 'warning' :
    order.status === 'preparacion' ? 'info' :
    'success';

  return (
    <Card
      className={`p-4 border-l-4 ${borderColor} ${order.isUrgent ? 'ring-2 ring-red-400' : ''} animate-fade-in`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 200px' }}
    >
      <div className="space-y-3">
        {/* Header: Order number + timer */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-gray-900 truncate">{order.orderNumber}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Clock size={14} className="text-gray-500" />
            <span className="text-lg font-mono font-bold tabular-nums text-gray-800">
              {order.elapsed}
            </span>
          </div>
        </div>

        {/* Customer name */}
        <p className="text-sm font-medium text-gray-700 truncate">{order.customerName}</p>

        {/* Items (collapsed) */}
        {order.items.length > 0 && (
          <div className="space-y-1 wrap-break-word">
            {(!expanded ? order.items.slice(0, 2) : order.items).map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-bold text-base text-gray-900">{item.quantity}</span>
                <span className="text-gray-700 truncate">{item.name}</span>
                {item.unit && <span className="text-xs text-gray-400">{item.unit}</span>}
              </div>
            ))}
            {!expanded && order.items.length > 2 && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded(true)} className="min-h-[48px]">
                +{order.items.length - 2} más...
              </Button>
            )}
            {expanded && order.items.length > 2 && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded(false)} className="min-h-[48px]">
                Ver menos
              </Button>
            )}
          </div>
        )}

        {/* Kitchen notes */}
        {order.kitchenNotes && (
          <div className="bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-800">{order.kitchenNotes}</p>
          </div>
        )}

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          {order.orderType === 'delivery' && (
            <Badge variant="info">Delivery</Badge>
          )}
          {order.orderType !== 'delivery' && (
            <Badge variant="neutral">Llevar</Badge>
          )}
          {order.modified && (
            <Badge variant="warning">Modificado</Badge>
          )}
          {order.isUrgent && (
            <Badge variant="danger">Urgente</Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {order.status === 'pedida' && (
            <Button
              variant="primary"
              className="flex-1 min-h-[80px] text-base font-semibold"
              onClick={handleStart}
              aria-label="Iniciar preparación"
            >
              Empezar
            </Button>
          )}
          {order.status === 'preparacion' && (
            <>
              <Button
                variant="primary"
                className="flex-1 min-h-[80px] text-base font-semibold"
                onClick={handleReady}
                aria-label="Marcar como listo"
              >
                Listo
              </Button>
              <Button
                variant="ghost"
                className="min-h-[80px] px-4"
                onClick={handleRevert}
                aria-label="Revertir a estado anterior"
              >
                Revertir
              </Button>
            </>
          )}
          {order.status === 'lista' && (
            <Button
              variant="ghost"
              className="min-h-[80px] px-4"
              onClick={handleRevert}
              aria-label="Revertir a estado anterior"
            >
              Revertir
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
});

export default function KitchenDisplay() {
  const {
    orders,
    pendingCount,
    preparingCount,
    readyCount,
    markAsPreparing,
    markAsReady,
    revertToPreparing,
    loading,
    audioSuspended,
    resumeAudio,
  } = useKitchenOrders();

  const [currentTime, setCurrentTime] = useState(formatTime());
  const oldestPendingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(formatTime());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (orders.length > 0 && oldestPendingRef.current) {
      oldestPendingRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [orders.length]);

  const pendingOrders = useMemo(() => orders.filter((o) => o.status === 'pedida'), [orders]);
  const preparingOrders = useMemo(() => orders.filter((o) => o.status === 'preparacion'), [orders]);
  const readyOrders = useMemo(() => orders.filter((o) => o.status === 'lista'), [orders]);

  const totalCount = orders.length;

  if (loading && orders.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
        {[1,2,3].map(col => (
          <div key={col} className="space-y-4">
            <Skeleton className="h-8 w-24" />
            {[1,2,3].map(row => (
              <div key={row} className="bg-white rounded-lg p-4 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Flame size={20} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Cocina</h2>
            <p className="text-xs text-text-secondary">
              {totalCount} pedido{totalCount !== 1 ? 's' : ''} activo{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {audioSuspended && (
            <Button variant="ghost" size="sm" onClick={resumeAudio} className="flex items-center gap-1.5">
              <Volume2 size={14} /> Activar sonido
            </Button>
          )}
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <Clock size={14} />
            <span className="font-mono">{currentTime}</span>
          </div>
        </div>
      </div>

      {/* Columns */}
      {orders.length === 0 ? (
        <EmptyState
          icon={<Flame size={48} className="text-gray-300 icon-float" />}
          title="No hay pedidos pendientes"
          description="Las órdenes que requieran cocina aparecerán aquí automáticamente."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Pendientes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block bg-amber-400" />
              <h3 className="font-semibold text-sm">Pendientes</h3>
              <Badge variant="warning">{pendingCount}</Badge>
            </div>
            {pendingOrders.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-8 text-xs text-text-muted">
                <Clock size={16} className="text-gray-300" />
                Sin pedidos
              </div>
            ) : (
              pendingOrders.map((order, i) => (
                <div key={order.id} ref={i === 0 ? oldestPendingRef : undefined}>
                  <OrderCard
                    order={order}
                    onStart={markAsPreparing}
                    onReady={NOOP}
                    onRevert={NOOP}
                  />
                </div>
              ))
            )}
          </div>

          {/* Preparación */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block bg-blue-500" />
              <h3 className="font-semibold text-sm">Preparación</h3>
              <Badge variant="info">{preparingCount}</Badge>
            </div>
            {preparingOrders.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-8 text-xs text-text-muted">
                <Flame size={16} className="text-gray-300" />
                Sin pedidos
              </div>
            ) : (
              preparingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onStart={NOOP}
                  onReady={markAsReady}
                  onRevert={revertToPreparing}
                />
              ))
            )}
          </div>

          {/* Listos */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block bg-green-500" />
              <h3 className="font-semibold text-sm">Listos</h3>
              <Badge variant="success">{readyCount}</Badge>
            </div>
            {readyOrders.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-8 text-xs text-text-muted">
                <Clock size={16} className="text-gray-300" />
                Sin pedidos
              </div>
            ) : (
              readyOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onStart={NOOP}
                  onReady={NOOP}
                  onRevert={revertToPreparing}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
