import { useState, useMemo, useEffect } from 'react';
import { Badge, Button, Card, EmptyState, Pagination } from '../../../common/components';
import { History, Clock, CheckCircle2, XCircle, AlertCircle, Eye, Package, Hash } from 'lucide-react';
import type { Recipe, ProductionOrder } from '../types';
import { ProductionDetailModal } from './ProductionDetailModal';
import { useProductionStore } from '../stores/productionStore';
import { useInventoryStore } from '../../inventory/stores/inventoryStore';

interface ProductionHistoryProps {
  orders: ProductionOrder[];
  recipes: Recipe[];
  // PLAN-115 (CODE-MIN-7): handler para cancelar orden (callback al padre que
  // muestra confirmacion). Solo se invoca si order.status === 'confirmed'.
  onCancel?: (orderId: string) => void;
  // PLAN-115 (CODE-MIN-7): orderId en curso de cancelacion (deshabilita boton + spinner)
  cancellingOrderId?: string | null;
  tenantId: string;
}

const PAGE_SIZE = 10;

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral'; icon: React.ReactNode }> = {
  draft: { label: 'Borrador', variant: 'neutral', icon: <Clock size={12} /> },
  confirmed: { label: 'Confirmada', variant: 'info', icon: <Clock size={12} /> },
  in_progress: { label: 'En Progreso', variant: 'warning', icon: <AlertCircle size={12} /> },
  done: { label: 'Completada', variant: 'success', icon: <CheckCircle2 size={12} /> },
  cancelled: { label: 'Cancelada', variant: 'danger', icon: <XCircle size={12} /> },
};

export function ProductionHistory({ orders, recipes, onCancel, cancellingOrderId, tenantId }: ProductionHistoryProps) {
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);
  const [ordersWithSales, setOrdersWithSales] = useState<Set<string>>(new Set());
  const { hasOrderSales } = useProductionStore();

  // Verificar ventas asociadas para órdenes confirmadas
  useEffect(() => {
    const checkSales = async () => {
      const confirmedOrders = orders.filter(o => o.status === 'confirmed');
      const withSales = new Set<string>();

      for (const order of confirmedOrders) {
        const hasSales = await hasOrderSales(tenantId, order.id);
        if (hasSales) {
          withSales.add(order.id);
        }
      }

      setOrdersWithSales(withSales);
    };

    if (orders.length > 0) {
      checkSales();
    }
  }, [orders, tenantId, hasOrderSales]);

  const recipeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const recipe of recipes) {
      map.set(recipe.id, recipe.name);
    }
    return map;
  }, [recipes]);

  const products = useInventoryStore((s) => s.products);
  const productUnitMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      map.set(p.id, p.unit);
    }
    return map;
  }, [products]);

  const totalPages = Math.ceil(orders.length / PAGE_SIZE);
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return orders.slice(start, start + PAGE_SIZE);
  }, [orders, page]);

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<History size={48} className="text-gray-300 icon-float" />}
        title="Sin historial"
        description="Crea una receta y ejecútala para generar tu primer historial."
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

  const getStatusBorderColor = (status: string) => {
    switch (status) {
      case 'done': return 'border-l-success';
      case 'confirmed': return 'border-l-info';
      case 'in_progress': return 'border-l-warning';
      case 'cancelled': return 'border-l-danger';
      default: return 'border-l-gray-300';
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 mb-2 px-1">
        {orders.length} orden{orders.length !== 1 ? 'es' : ''} registrada{orders.length !== 1 ? 's' : ''}
      </h3>

      <div className="history-stagger">
      {paginatedOrders.map((order) => {
        const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;
        const canCancel = order.status === 'confirmed' && onCancel != null && !ordersWithSales.has(order.id);
        const isCancelling = cancellingOrderId === order.id;

        return (
          <Card key={order.id} className={`p-3 sm:p-4 mb-2 hover:shadow-md transition-all duration-200 border-l-[3px] ${getStatusBorderColor(order.status)}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <h4 className="font-semibold text-sm wrap-break-word">
                    {recipeMap.get(order.recipeId) || 'Receta eliminada'}
                  </h4>
                  <Badge variant={statusConfig.variant} className="shrink-0">
                    <span className="flex items-center gap-1">
                      {statusConfig.icon}
                      {statusConfig.label}
                    </span>
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Package size={11} className="text-gray-400" />
                    {order.batchCount} lote{order.batchCount !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Hash size={11} className="text-gray-400" />
                    {order.quantityTarget} {productUnitMap.get(order.productId) || 'unid.'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} className="text-gray-400" />
                    {formatDate(order.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-start flex-wrap">
                  <Button
                    variant="ghost-primary"
                    size="sm"
                    onClick={() => setSelectedOrder(order)}
                    className="min-h-[44px]"
                    aria-label="Ver detalles"
                  >
                    <Eye size={14} className="mr-1" />
                    Ver Detalles
                  </Button>
                {canCancel && (
                    <Button
                      variant="ghost-danger"
                      size="sm"
                      onClick={() => onCancel(order.id)}
                      disabled={isCancelling}
                      className="min-h-[44px]"
                      aria-label="Cancelar orden"
                    >
                      <XCircle size={14} className="mr-1" />
                      {isCancelling ? 'Cancelando...' : 'Cancelar'}
                    </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {selectedOrder && (
        <ProductionDetailModal
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          order={selectedOrder}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}
