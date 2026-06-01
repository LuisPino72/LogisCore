import { useState, useMemo } from 'react';
import { Badge, Card, EmptyState, Pagination } from '../../../common/components';
import { History, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import type { Recipe, ProductionOrder } from '../types';

interface ProductionHistoryProps {
  orders: ProductionOrder[];
  recipes: Recipe[];
}

const PAGE_SIZE = 10;

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral'; icon: React.ReactNode }> = {
  draft: { label: 'Borrador', variant: 'neutral', icon: <Clock size={12} /> },
  confirmed: { label: 'Confirmada', variant: 'info', icon: <Clock size={12} /> },
  in_progress: { label: 'En Progreso', variant: 'warning', icon: <AlertCircle size={12} /> },
  done: { label: 'Completada', variant: 'success', icon: <CheckCircle2 size={12} /> },
  cancelled: { label: 'Cancelada', variant: 'danger', icon: <XCircle size={12} /> },
};

export function ProductionHistory({ orders, recipes }: ProductionHistoryProps) {
  const [page, setPage] = useState(1);

  const recipeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const recipe of recipes) {
      map.set(recipe.id, recipe.name);
    }
    return map;
  }, [recipes]);

  const totalPages = Math.ceil(orders.length / PAGE_SIZE);
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return orders.slice(start, start + PAGE_SIZE);
  }, [orders, page]);

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<History size={48} className="text-gray-300" />}
        title="Sin historial"
        description="Las órdenes de producción aparecerán aquí."
      />
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        {orders.length} orden(es) en total
      </h3>

      {paginatedOrders.map((order) => {
        const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;

        return (
          <Card key={order.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-sm truncate">
                    {recipeMap.get(order.recipeId) || 'Desconocida'}
                  </h4>
                  <Badge variant={statusConfig.variant} className="shrink-0">
                    <span className="flex items-center gap-1">
                      {statusConfig.icon}
                      {statusConfig.label}
                    </span>
                  </Badge>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>
                    Lotes: {order.batchCount} · Total: {order.quantityTarget} unidades
                  </p>
                  <p>{formatDate(order.createdAt)}</p>
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
