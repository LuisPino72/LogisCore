import { useState, useEffect, useDeferredValue, useMemo, useCallback, memo, useRef } from 'react';
import { Badge, Button, Input, Skeleton, EmptyState, Modal } from '@/common/components';
import { getActiveOrders } from '../services/saleService';
import type { DexieSale } from '../../../services/dexie/types';
import { Clock, Truck, ChefHat, Search, Package, DollarSign, CheckCircle2, MessageCircle, Smartphone, Info, Send, MapPin, CreditCard } from 'lucide-react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pedida: { label: 'Pedida', color: 'text-info', bg: 'bg-info/5 border-info/20' },
  preparacion: { label: 'Preparación', color: 'text-warning', bg: 'bg-warning/5 border-warning/20' },
  lista: { label: 'Lista', color: 'text-success', bg: 'bg-success/5 border-success/20' },
  pagada: { label: 'Pagada', color: 'text-primary', bg: 'bg-primary/5 border-primary/20' },
  despachada: { label: 'Despachada', color: 'text-text-muted', bg: 'bg-surface-alt border-border' },
};

const VARIANT_MAP: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  pedida: 'info', preparacion: 'warning', lista: 'success', pagada: 'info', despachada: 'neutral', cancelada: 'danger', entregada: 'success',
};

const STATUS_BADGE_VARIANT = (status: string) => VARIANT_MAP[status] ?? 'info';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
}

interface OrdersTabProps {
  tenantId: string;
  onPayOrder?: (sale: DexieSale) => void;
  onDispatchOrder?: (sale: DexieSale) => void;
  onConfirmDelivery?: (saleId: string) => void;
  onSendAddressToMotorizado?: (sale: DexieSale) => void;
  onNotifyCustomerAfterDispatch?: (sale: DexieSale) => void;
}

export const OrdersTab = memo(function OrdersTab({ tenantId, onPayOrder, onDispatchOrder, onConfirmDelivery, onSendAddressToMotorizado, onNotifyCustomerAfterDispatch }: OrdersTabProps) {
  const [orders, setOrders] = useState<DexieSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const cancelledRef = useRef(false);
  const session = useAuthStore((s) => s.session);
  const canPayOrder = hasActionPermission(session, 'pos', 'create');
  const [selectedOrderForTimeline, setSelectedOrderForTimeline] = useState<DexieSale | null>(null);

  const reload = useCallback(async () => {
    const result = await getActiveOrders(tenantId);
    if (!cancelledRef.current && result.ok) {
      const sorted = [...result.data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(sorted);
    }
  }, [tenantId]);

  useEffect(() => {
    cancelledRef.current = false;
    async function load() {
      setLoading(true);
      try {
        await reload();
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    }
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [reload]);

  useEffect(() => {
    const interval = setInterval(reload, 30000);
    return () => clearInterval(interval);
  }, [reload]);

  useEffect(() => {
    const subs = [
      EventBus.on(SystemEvents.ORDER_CREATED, reload),
      EventBus.on(SystemEvents.ORDER_STATUS_CHANGED, reload),
      EventBus.on(SystemEvents.ORDER_CANCELLED, reload),
      EventBus.on(SystemEvents.ORDER_DELIVERED, reload),
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, (payload: unknown) => {
        const { table } = payload as { table?: string };
        if (table === '*' || table === 'sales') reload();
      }),
    ];
    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [reload]);

  const filtered = useMemo(() => {
    if (!deferredSearch.trim()) return orders;
    const q = deferredSearch.toLowerCase();
    return orders.filter((o) =>
      o.orderNumber?.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      o.customerId?.toLowerCase().includes(q)
    );
  }, [orders, deferredSearch]);

  if (loading && !orders.length) {
    return (
      <div className="space-y-3 p-4">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="bg-white rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2 mt-2">
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Package size={32} className="text-gray-400" />}
        title="Sin pedidos activos"
        description="Las órdenes de delivery y cocina aparecerán aquí."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
        <Input
          placeholder="Buscar por # o cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={32} className="text-gray-400" />}
          title="Sin resultados"
          description="No se encontraron pedidos con ese criterio."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((order) => {
            const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pedida;
            return (
              <div
                key={order.id}
                className={`p-3 rounded-xl border ${cfg.bg} transition-all`}
                style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 200px' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-900">
                        {order.orderNumber ?? order.id.slice(0, 8)}
                      </span>
                      <Badge variant={STATUS_BADGE_VARIANT(order.status)} className="text-[10px]">
                        {cfg.label}
                      </Badge>
                      {order.needsKitchen && (
                        <Badge variant="warning" className="text-[10px]">
                          <ChefHat size={10} className="inline mr-0.5" />
                          Cocina
                        </Badge>
                      )}
                       {order.orderType === 'delivery' && (
                         <Badge variant="info" className="text-[10px]">
                           <Truck size={10} className="inline mr-0.5" />
                           Delivery
                         </Badge>
                       )}
                       {order.isUrgent && (
                         <Badge variant="danger" className="text-[10px]">
                           🚨 Urgente
                         </Badge>
                       )}
                       {order.status === 'lista' && (() => {
                         const listaEntry = order.statusHistory
                           ?.filter((h) => h.status === 'lista')
                           .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                         if (listaEntry && (Date.now() - new Date(listaEntry.timestamp).getTime()) > 1800000) {
                           return (
                             <Badge variant="warning" className="text-[10px]">
                               ⏰ Pendiente de pago
                             </Badge>
                           );
                         }
                           return null;
                       })()}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-text-secondary">
                      <Clock size={12} />
                      <span>{timeAgo(order.createdAt)}</span>
                      <span className="text-gray-300">|</span>
                      <span className="font-medium text-gray-700">{order.totalUsd?.toFixed(2) ?? '0.00'} USD</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedOrderForTimeline(order)}
                    className="min-h-11 min-w-11 p-0 shrink-0"
                    aria-label="Ver historial de comunicación"
                  >
                    <Info size={16} className="text-gray-400" />
                  </Button>
                </div>

                {order.status === 'lista' && onPayOrder && canPayOrder && (
                  <div className="mt-2 pt-2 border-t border-black/5">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onPayOrder(order)}
                      className="min-h-11 text-xs w-full"
                      aria-label={`Cobrar orden ${order.orderNumber || ''}`}
                    >
                      <DollarSign size={14} />
                      Cobrar
                    </Button>
                  </div>
                )}

                {order.status === 'pagada' && onDispatchOrder && (
                  <div className="mt-2 pt-2 border-t border-black/5">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onDispatchOrder(order)}
                      className="min-h-11 text-xs w-full"
                      aria-label={`Despachar orden ${order.orderNumber || ''}`}
                    >
                      <Truck size={14} />
                      Despachar
                    </Button>
                  </div>
                )}

                {order.status === 'despachada' && onConfirmDelivery && (
                  <div className="mt-2 pt-2 border-t border-black/5 flex flex-wrap gap-2">
                    <Button
                      variant="ghost-success"
                      size="sm"
                      onClick={() => onConfirmDelivery(order.id)}
                      className="min-h-11 text-xs flex-1"
                      aria-label={`Confirmar entrega orden ${order.orderNumber || ''}`}
                    >
                      <CheckCircle2 size={14} />
                      Confirmar Entrega
                    </Button>
                    {onSendAddressToMotorizado && order.deliveryPersonName && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onSendAddressToMotorizado(order)}
                        className="min-h-11 text-xs"
                        aria-label="Enviar dirección al motorizado"
                      >
                        <MessageCircle size={14} />
                      </Button>
                    )}
                    {onNotifyCustomerAfterDispatch && order.customerId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onNotifyCustomerAfterDispatch(order)}
                        className="min-h-11 text-xs"
                        aria-label="Notificar al cliente"
                      >
                        <Smartphone size={14} />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!selectedOrderForTimeline}
        onClose={() => setSelectedOrderForTimeline(null)}
        title={`Historial - ${selectedOrderForTimeline?.orderNumber ?? ''}`}
        size="sm"
      >
        {selectedOrderForTimeline && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">Detalles del Pedido</h4>
              <div className="text-xs text-gray-600 space-y-1">
                <p>Estado: <span className="font-medium">{STATUS_CONFIG[selectedOrderForTimeline.status]?.label ?? selectedOrderForTimeline.status}</span></p>
                <p>Total: <span className="font-medium">{selectedOrderForTimeline.totalUsd?.toFixed(2) ?? '0.00'} USD</span></p>
                {selectedOrderForTimeline.deliveryPersonName && (
                  <p>Delivery: <span className="font-medium">{selectedOrderForTimeline.deliveryPersonName}</span></p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">Historial de Estados</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {(selectedOrderForTimeline.statusHistory ?? []).map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1 shrink-0" />
                    <div>
                      <span className="font-medium">{STATUS_CONFIG[entry.status]?.label ?? entry.status}</span>
                      <span className="text-gray-400 ml-2">{timeAgo(entry.timestamp)}</span>
                      {entry.by && <span className="text-gray-400 ml-1">por {entry.by.slice(0, 8)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">Comunicaciones</h4>
              {(selectedOrderForTimeline.communicationLog ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">No hay comunicaciones registradas.</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {(selectedOrderForTimeline.communicationLog ?? []).map((entry, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-2 bg-gray-50 rounded-lg">
                      <div className="shrink-0 mt-0.5">
                        {entry.type === 'menu_sent' && <Send size={12} className="text-blue-500" />}
                        {entry.type === 'order_summary_sent' && <MessageCircle size={12} className="text-green-500" />}
                        {entry.type === 'delivery_address_sent' && <MapPin size={12} className="text-orange-500" />}
                        {entry.type === 'motorizado_contact_sent' && <Smartphone size={12} className="text-purple-500" />}
                        {entry.type === 'payment_confirmed' && <CreditCard size={12} className="text-emerald-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{entry.type.replace(/_/g, ' ')}</span>
                          <span className="text-gray-400">{timeAgo(entry.timestamp)}</span>
                        </div>
                        <p className="text-gray-500 truncate">{entry.phone}</p>
                        {entry.messagePreview && (
                          <p className="text-gray-400 truncate mt-0.5">{entry.messagePreview}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
});