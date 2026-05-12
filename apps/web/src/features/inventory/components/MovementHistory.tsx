import { useState } from 'react';
import { History, TrendingUp, TrendingDown, Package } from 'lucide-react';
import { Badge, EmptyState } from '../../../common/components';
import type { Product } from '../types';
import { displayStock } from '../types';
import { inventoryService } from '../services/inventoryService';
import type { InventoryMovement } from '../../../specs/inventory';

interface MovementHistoryProps {
  products: Product[];
}

export function MovementHistory({ products }: MovementHistoryProps) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(false);

  const handleProductChange = async (productId: string) => {
    setSelectedProductId(productId);
    if (!productId) { setMovements([]); return; }
    setLoading(true);
    const result = await inventoryService.getMovementHistory(productId);
    if (result.ok) setMovements(result.data);
    setLoading(false);
  };

  const getTypeLabel = (mov: InventoryMovement) => {
    if (mov.type === 'adjustment' && mov.reason) return mov.reason;
    switch (mov.type) {
      case 'sale': return 'Venta';
      case 'purchase': return 'Compra';
      case 'adjustment': return 'Ajuste';
      default: return mov.type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'sale': return <TrendingDown size={14} className="text-danger" />;
      case 'purchase': return <TrendingUp size={14} className="text-success" />;
      case 'adjustment': return <Package size={14} className="text-warning" />;
      default: return null;
    }
  };

  const getTypeBadge = (type: string): 'success' | 'warning' | 'danger' | 'info' => {
    switch (type) {
      case 'sale': return 'danger';
      case 'purchase': return 'success';
      case 'adjustment': return 'warning';
      default: return 'info';
    }
  };

  return (
    <div className="space-y-4">
      <div className="input-wrapper">
        <label className="input-label">Seleccionar producto</label>
        <select
          className="select"
          value={selectedProductId}
          onChange={(e) => handleProductChange(e.target.value)}
        >
          <option value="">Seleccionar producto...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-gray-400">Cargando movimientos...</p>}

      {!loading && movements.length === 0 && selectedProductId && (
        <EmptyState icon={<History size={32} />} title="Sin movimientos" description="Este producto no tiene movimientos registrados" />
      )}

      {!loading && movements.length > 0 && (
        <div className="space-y-2">
          {movements.map((mov) => (
            <div key={mov.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
              {getTypeIcon(mov.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={getTypeBadge(mov.type)}>
                    {getTypeLabel(mov)}
                  </Badge>
                  <span className="text-sm font-semibold">
                    {(() => {
                      const prod = products.find(p => p.id === mov.productId);
                      const abs = Math.abs(mov.quantity);
                      const display = prod?.isWeighted
                        ? displayStock(abs, prod.unit)
                        : abs.toString();
                      return `${mov.quantity > 0 ? '+' : '-'}${display}${prod?.isWeighted ? ` ${prod.unit}` : ''}`;
                    })()}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  Stock: {(() => {
                    const prod = products.find(p => p.id === mov.productId);
                    if (!prod?.isWeighted) return `${mov.previousStock} → ${mov.newStock}`;
                    return `${displayStock(mov.previousStock, prod.unit)} → ${displayStock(mov.newStock, prod.unit)} ${prod.unit}`;
                  })()}
                </div>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">
                {new Date(mov.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}

      {!selectedProductId && (
        <p className="text-sm text-gray-400 text-center py-4">Selecciona un producto para ver su historial</p>
      )}
    </div>
  );
}
