import { useState, useEffect, useDeferredValue, useMemo } from 'react';
import { Badge, Spinner, EmptyState } from '@/common/components';
import { getDb } from '../../../services/dexie/db';
import type { DexieSale } from '../../../services/dexie/types';
import { Clock, Truck, ChefHat, Search, Package } from 'lucide-react';

const ACTIVE_STATUSES = ['pedida', 'preparacion', 'lista', 'pagada', 'despachada'] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pedida: { label: 'Pedida', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  preparacion: { label: 'Preparación', color: 'text-warning', bg: 'bg-warning/5 border-warning/20' },
  lista: { label: 'Lista', color: 'text-success', bg: 'bg-success/5 border-success/20' },
  pagada: { label: 'Pagada', color: 'text-primary', bg: 'bg-primary/5 border-primary/20' },
  despachada: { label: 'Despachada', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
};

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
}

export function OrdersTab({ tenantId }: OrdersTabProps) {
  const [orders, setOrders] = useState<DexieSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const db = getDb();
        const all = await db.sales
          .where({ tenantId })
          .filter((s) => !s.deletedAt && ACTIVE_STATUSES.includes(s.status as typeof ACTIVE_STATUSES[number]))
          .toArray();
        if (!cancelled) {
          all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setOrders(all);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tenantId]);

  const filtered = useMemo(() => {
    if (!deferredSearch.trim()) return orders;
    const q = deferredSearch.toLowerCase();
    return orders.filter((o) =>
      o.orderNumber?.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      o.customerId?.toLowerCase().includes(q)
    );
  }, [orders, deferredSearch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
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
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por # o cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 min-h-11 rounded-xl border border-border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
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
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-900">
                        {order.orderNumber ?? order.id.slice(0, 8)}
                      </span>
                      <Badge variant={order.status === 'cancelada' ? 'danger' : order.status === 'entregada' ? 'success' : 'info'} className="text-[10px]">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
