import { useState, useEffect } from 'react';
import { DollarSign, Calendar, Layers } from 'lucide-react';
import { Card, Badge, Spinner, EmptyState } from '@/common/components';
import { inventoryService } from '../services/inventoryService';
import type { ActiveLot } from '../types';
import { gramsToKg, mlToLt } from '../types';

interface ProductLotsProps {
  productId: string;
  tenantId: string;
  unit?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: '2-digit' });
}

function displayQty(value: number, unit?: string): string {
  if (unit === 'kg') return gramsToKg(value).toFixed(2);
  if (unit === 'lt') return mlToLt(value).toFixed(2);
  return value.toString();
}

function unitLabel(unit?: string): string {
  if (unit === 'kg') return 'Kg';
  if (unit === 'lt') return 'Lt';
  return '';
}

export function ProductLots({ productId, tenantId: _tenantId, unit }: ProductLotsProps) {
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
        description="No hay lotes con stock disponible. Los lotes se crean al registrar entradas de inventario."
      />
    );
  }

  return (
    <div className="space-y-3">
      {lots.map((lot, index) => {
        const consumed = lot.quantityAdded - lot.remainingQuantity;
        const pct = lot.quantityAdded > 0 ? Math.round((consumed / lot.quantityAdded) * 100) : 0;
        const isFirst = index === 0;
        const label = unitLabel(unit);

        return (
          <Card key={lot.id} className={`p-4 transition-shadow hover:shadow-md ${isFirst ? 'border-l-4 border-l-accent' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                {isFirst && (
                  <Badge variant="warning" className="text-[10px]">FIFO — Activo</Badge>
                )}
                {lot.productLabel && (
                  <Badge variant="neutral" className="text-[10px]">{lot.productLabel}</Badge>
                )}
              </div>
              <Badge variant={lot.remainingQuantity > 0 ? 'success' : 'neutral'}>
                {displayQty(lot.remainingQuantity, unit)} {label} restantes
              </Badge>
            </div>

            {lot.quantityAdded > 0 && (
              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-xs text-text-secondary">
                  <span>Consumo</span>
                  <span>{displayQty(consumed, unit)}/{displayQty(lot.quantityAdded, unit)} ({pct}%)</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: pct >= 100 ? 'var(--color-success)' : 'var(--color-accent)',
                    }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400 shrink-0" />
                <div>
                  <p className="text-text-secondary">Fecha ingreso</p>
                  <p className="font-semibold text-gray-800">{formatDate(lot.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-gray-400 shrink-0" />
                <div>
                  <p className="text-text-secondary">Costo unitario</p>
                  <p className="font-semibold text-gray-800">
                    {typeof lot.costUsdPerUnit === 'number' && lot.costUsdPerUnit > 0
                      ? `$${(unit === 'kg' || unit === 'lt' ? lot.costUsdPerUnit * 1000 : lot.costUsdPerUnit).toFixed(4)}`
                      : '-'}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
