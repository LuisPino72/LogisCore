import { useState, useEffect } from 'react';
import { Package, DollarSign, Calendar, Layers } from 'lucide-react';
import { Card, Badge, Spinner, EmptyState } from '@/common/components';
import { inventoryService } from '../services/inventoryService';
import type { ActiveLot } from '../types';

interface ProductLotsProps {
  productId: string;
  tenantId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function ProductLots({ productId, tenantId: _tenantId }: ProductLotsProps) {
  const [lots, setLots] = useState<ActiveLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    inventoryService.getProductLots(productId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setLots(res.data);
      } else {
        setError(res.error.message);
      }
    });
    return () => { cancelled = true; };
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-4 bg-danger/5 text-danger text-sm text-center">{error}</Card>
    );
  }

  if (lots.length === 0) {
    return (
      <EmptyState
        icon={<Layers size={32} />}
        title="Sin lotes activos"
        description="No hay lotes con stock disponible para este producto"
      />
    );
  }

  return (
    <div className="space-y-3">
      {lots.map((lot) => (
        <Card key={lot.id} className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-primary" />
              <span className="text-xs font-mono text-gray-500">#{lot.id.slice(0, 8)}</span>
            </div>
            <Badge variant={lot.remainingQuantity > 0 ? 'success' : 'neutral'}>
              {lot.remainingQuantity} restantes
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-gray-400" />
              <div>
                <p className="text-gray-500">Fecha ingreso</p>
                <p className="font-semibold text-gray-800">{formatDate(lot.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign size={14} className="text-gray-400" />
              <div>
                <p className="text-gray-500">Costo unitario</p>
                <p className="font-semibold text-gray-800">
                  {lot.costUsdPerUnit ? `$${lot.costUsdPerUnit.toFixed(4)}` : '-'}
                </p>
              </div>
            </div>
            <div>
              <p className="text-gray-500">Cantidad inicial</p>
              <p className="font-semibold text-gray-800">{lot.quantityAdded}</p>
            </div>
            <div>
              <p className="text-gray-500">Consumido</p>
              <p className="font-semibold text-gray-800">{lot.quantityAdded - lot.remainingQuantity}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
