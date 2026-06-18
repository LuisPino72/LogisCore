import { useState, useEffect } from 'react';
import { Modal, Badge, Spinner, Tabs } from '../../../common/components';
import type { Tab } from '../../../common/components';
import { formatUsd } from '@/lib/formatBs';
import { useProductionStore } from '../stores/productionStore';
import type { ProductionOrder } from '../types';

interface ProductionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ProductionOrder;
  tenantId: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'info' | 'danger' | 'neutral' }> = {
  draft: { label: 'Borrador', variant: 'neutral' },
  confirmed: { label: 'Confirmada', variant: 'info' },
  in_progress: { label: 'En Progreso', variant: 'warning' },
  done: { label: 'Completada', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};

export function ProductionDetailModal({ isOpen, onClose, order, tenantId }: ProductionDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'resumen' | 'ingredientes' | 'movimientos'>('resumen');
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<{
    recipeName: string;
    productName: string;
    batchCount: number;
    quantityTarget: number;
    quantityProduced: number;
    wastePct: number;
    wasteNotes?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    ingredientCosts: Array<{
      productName: string;
      quantity: number;
      unit: string;
      costPerUnit: number;
      totalCost: number;
    }>;
    totalCost: number;
    costPerUnit: number;
  } | null>(null);
  const [movements, setMovements] = useState<Array<{
    productName: string;
    type: string;
    quantity: number;
    previousStock: number;
    newStock: number;
    createdAt: string;
  }>>([]);

  const { getOrderDetails, getOrderInventoryMovements } = useProductionStore();

  useEffect(() => {
    if (!isOpen || !order) return;

    const loadDetails = async () => {
      setLoading(true);
      const [detailsResult, movementsResult] = await Promise.all([
        getOrderDetails(tenantId, order.id),
        getOrderInventoryMovements(tenantId, order.id),
      ]);

      if (detailsResult) {
        setDetails({
          recipeName: detailsResult.recipe.name,
          productName: detailsResult.recipe.productId,
          batchCount: order.batchCount,
          quantityTarget: order.quantityTarget,
          quantityProduced: order.quantityProduced,
          wastePct: detailsResult.recipe.wastePct,
          wasteNotes: order.wasteNotes,
          createdAt: order.createdAt,
          startedAt: order.startedAt,
          completedAt: order.completedAt,
          ingredientCosts: detailsResult.ingredientCosts,
          totalCost: detailsResult.totalCost,
          costPerUnit: detailsResult.costPerUnit,
        });
      }

      if (movementsResult) {
        setMovements(movementsResult);
      }

      setLoading(false);
    };

    loadDetails();
  }, [isOpen, order, tenantId, getOrderDetails, getOrderInventoryMovements]);

  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;

  if (loading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Detalles de Producción" size="lg">
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalles de Producción" size="lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h4 className="text-lg font-semibold text-gray-900 wrap-break-word">
              {details?.recipeName || 'Receta'}
            </h4>
            <p className="text-sm text-gray-500">
              {details?.batchCount} lote(s) — {details?.quantityTarget} unidades objetivo
            </p>
          </div>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>

        <Tabs
          tabs={[
            { key: 'resumen', label: 'Resumen' },
            { key: 'ingredientes', label: 'Ingredientes', badge: details?.ingredientCosts?.length || 0 },
            { key: 'movimientos', label: 'Movimientos', badge: movements.length },
          ] as Tab[]}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'resumen' | 'ingredientes' | 'movimientos')}
        />

        {/* Tab content */}
        {activeTab === 'resumen' && (
          <div className="space-y-4 animate-tab-fade">
            {/* Resumen de producción */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 border-t-2 border-primary stat-card-glow">
                <p className="text-xs text-gray-500">Lotes</p>
                <p className="text-lg font-semibold text-gray-900 overflow-hidden text-ellipsis">{order.batchCount}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border-t-2 border-info stat-card-glow">
                <p className="text-xs text-gray-500">Objetivo</p>
                <p className="text-lg font-semibold text-gray-900 overflow-hidden text-ellipsis">{order.quantityTarget}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border-t-2 border-success stat-card-glow">
                <p className="text-xs text-gray-500">Producido</p>
                <p className="text-lg font-semibold text-gray-900 overflow-hidden text-ellipsis">{order.quantityProduced}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border-t-2 border-warning stat-card-glow">
                <p className="text-xs text-gray-500">Merma</p>
                <p className="text-lg font-semibold text-gray-900 overflow-hidden text-ellipsis">{details?.wastePct || 0}%</p>
              </div>
            </div>

            {/* Fechas - Timeline */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h5 className="text-sm font-medium text-gray-700 mb-3">Fechas</h5>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <div className="w-0.5 h-6 bg-gray-200" />
                  {order.startedAt && <div className="w-2 h-2 rounded-full bg-info" />}
                  {order.startedAt && <div className="w-0.5 h-6 bg-gray-200" />}
                  {order.completedAt && <div className="w-2 h-2 rounded-full bg-success" />}
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-gray-500">Creación:</span>{' '}
                    <span className="text-gray-900 font-medium">{new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>
                  {order.startedAt && (
                    <div>
                      <span className="text-gray-500">Inicio:</span>{' '}
                      <span className="text-gray-900 font-medium">{new Date(order.startedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                  {order.completedAt && (
                    <div>
                      <span className="text-gray-500">Completado:</span>{' '}
                      <span className="text-gray-900 font-medium">{new Date(order.completedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Notas de merma */}
            {details?.wasteNotes && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h5 className="text-sm font-medium text-gray-700 mb-1">Notas de Merma</h5>
                <p className="text-sm text-gray-600 wrap-break-word">{details.wasteNotes}</p>
              </div>
            )}

            {/* Costos */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Costos</h5>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Costo total ingredientes:</span>
                <span className="font-semibold text-gray-900">{formatUsd(details?.totalCost || 0)}</span>
              </div>
              {details?.costPerUnit != null && details.costPerUnit > 0 && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-600">Costo por unidad producida:</span>
                  <span className="font-semibold text-gray-900">{formatUsd(details.costPerUnit)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'ingredientes' && details?.ingredientCosts && details.ingredientCosts.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3 animate-tab-fade">
            <h5 className="text-sm font-medium text-gray-700 mb-2">Ingredientes Consumidos</h5>
            <div className="sm:hidden space-y-2 recipe-stagger">
              {details.ingredientCosts.map((ing, idx) => (
                <div key={idx} className="bg-white rounded-lg p-3 border border-gray-100 space-y-1">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-semibold text-gray-900 min-w-0">{ing.productName}</span>
                    <span className="text-sm font-medium text-gray-900 shrink-0 ml-2">{formatUsd(ing.totalCost)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{ing.quantity} {ing.unit}</span>
                    <span>{formatUsd(ing.costPerUnit)}/un</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-gray-600 font-medium">Ingrediente</th>
                    <th className="text-right py-2 text-gray-600 font-medium">Cantidad</th>
                    <th className="text-right py-2 text-gray-600 font-medium">Costo/Unidad</th>
                    <th className="text-right py-2 text-gray-600 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {details.ingredientCosts.map((ing, idx) => (
                    <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-primary/5 transition-colors">
                      <td className="py-2 text-gray-900 wrap-break-word">{ing.productName}</td>
                      <td className="py-2 text-right text-gray-700">{ing.quantity} {ing.unit}</td>
                      <td className="py-2 text-right text-gray-700">{formatUsd(ing.costPerUnit)}</td>
                      <td className="py-2 text-right text-gray-900 font-medium">{formatUsd(ing.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'movimientos' && movements.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3 animate-tab-fade">
            <h5 className="text-sm font-medium text-gray-700 mb-2">Movimientos de Inventario</h5>
            <div className="sm:hidden space-y-2 recipe-stagger">
              {movements.map((m, idx) => (
                <div key={idx} className={`bg-white rounded-lg p-3 border border-gray-100 space-y-1 border-l-[3px] ${m.type === 'production_output' ? 'border-l-success' : 'border-l-danger'}`}>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-semibold text-gray-900 min-w-0">{m.productName}</span>
                    <span className={`text-sm font-medium shrink-0 ml-2 ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${m.type === 'production_output' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {m.type === 'production_output' ? 'Producción' : 'Consumo'}
                    </span>
                    <span>{m.previousStock} → {m.newStock}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-gray-600 font-medium">Producto</th>
                    <th className="text-left py-2 text-gray-600 font-medium">Tipo</th>
                    <th className="text-right py-2 text-gray-600 font-medium">Cantidad</th>
                    <th className="text-right py-2 text-gray-600 font-medium">Stock Anterior</th>
                    <th className="text-right py-2 text-gray-600 font-medium">Stock Nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m, idx) => (
                    <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-primary/5 transition-colors">
                      <td className="py-2 text-gray-900 wrap-break-word">{m.productName}</td>
                      <td className="py-2 text-gray-700">
                        {m.type === 'production_output' ? 'Producción' : 'Consumo'}
                      </td>
                      <td className={`py-2 text-right font-medium ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </td>
                      <td className="py-2 text-right text-gray-700">{m.previousStock}</td>
                      <td className="py-2 text-right text-gray-900">{m.newStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
