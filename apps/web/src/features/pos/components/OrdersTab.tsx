import { useState, useEffect, useDeferredValue, useMemo, useCallback, memo, useRef } from 'react';
import { Badge, Button, Input, Skeleton, EmptyState } from '@/common/components';
import { getActiveOrders } from '../services/saleService';
import type { DexieSale } from '../../../services/dexie/types';
import { Clock, Truck, ChefHat, Search, Package, DollarSign, CheckCircle2 } from 'lucide-react';
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
}

export const OrdersTab = memo(function OrdersTab({ tenantId, onPayOrder, onDispatchOrder, onConfirmDelivery }: OrdersTabProps) {
  const [orders, setOrders] = useState<DexieSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const cancelledRef = useRef(false);
  const session = useAuthStore((s) => s.session);
  const canPayOrder = hasActionPermission(session, 'pos', 'create');

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
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-text-secondary">
                      <Clock size={12} />
                      <span>{timeAgo(order.createdAt)}</span>
                      <span className="text-gray-300">|</span>
                      <span className="font-medium text-gray-700">{order.totalUsd?.toFixed(2) ?? '0.00'} USD</span>
                    </div>
                  </div>
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
                  <div className="mt-2 pt-2 border-t border-black/5">
                    <Button
                      variant="ghost-success"
                      size="sm"
                      onClick={() => onConfirmDelivery(order.id)}
                      className="min-h-11 text-xs w-full"
                      aria-label={`Confirmar entrega orden ${order.orderNumber || ''}`}
                    >
                      <CheckCircle2 size={14} />
                      Confirmar Entrega
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});