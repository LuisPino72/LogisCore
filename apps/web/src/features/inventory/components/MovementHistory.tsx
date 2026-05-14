import { useState, useMemo } from 'react';
import { History, TrendingUp, TrendingDown, Package } from 'lucide-react';
import { Badge, DataTable } from '../../../common/components';
import type { Column } from '../../../common/components';
import type { Product } from '../types';
import { displayStock } from '../types';
import { inventoryService } from '../services/inventoryService';
import type { InventoryMovement } from '../../../specs/inventory';

interface MovementHistoryProps {
  products: Product[];
}

function getTypeLabel(mov: InventoryMovement) {
  if (mov.type === 'adjustment' && mov.reason) return mov.reason;
  switch (mov.type) {
    case 'sale': return 'Venta';
    case 'purchase': return 'Compra';
    case 'adjustment': return 'Ajuste';
    default: return mov.type;
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'sale': return <TrendingDown size={14} className="text-danger" />;
    case 'purchase': return <TrendingUp size={14} className="text-success" />;
    case 'adjustment': return <Package size={14} className="text-warning" />;
    default: return null;
  }
}

function getTypeBadge(type: string): 'success' | 'warning' | 'danger' | 'info' {
  switch (type) {
    case 'sale': return 'danger';
    case 'purchase': return 'success';
    case 'adjustment': return 'warning';
    default: return 'info';
  }
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

  const columns = useMemo((): Column<InventoryMovement>[] => [
    {
      key: 'type',
      header: 'Movimiento',
      render: (mov) => {
        const prod = products.find((p) => p.id === mov.productId);
        const sign = mov.type === 'sale' ? -1 : (mov.type === 'purchase' ? 1 : Math.sign(mov.quantity));
        const signedQty = Math.abs(mov.quantity) * sign;
        return (
          <div className="flex items-center gap-2">
            {getTypeIcon(mov.type)}
            <Badge variant={getTypeBadge(mov.type)}>{getTypeLabel(mov)}</Badge>
            <span className="text-sm font-semibold">
              {signedQty > 0 ? '+' : ''}{signedQty}{prod?.isWeighted ? ` ${prod.unit}` : ''}
            </span>
          </div>
        );
      },
    },
    {
      key: 'stockChange',
      header: 'Stock',
      hideOnMobile: true,
      render: (mov) => {
        const prod = products.find((p) => p.id === mov.productId);
        if (!prod?.isWeighted) {
          return <span className="text-xs text-gray-400">{mov.previousStock} → {mov.newStock}</span>;
        }
        return (
          <span className="text-xs text-gray-400">
            {displayStock(mov.previousStock, prod.unit)} → {displayStock(mov.newStock, prod.unit)} {prod.unit}
          </span>
        );
      },
    },
    {
      key: 'date',
      header: 'Fecha',
      className: 'text-right',
      render: (mov) => (
        <span className="text-[10px] text-gray-400">
          {new Date(mov.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
  ], [products]);

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

      {!selectedProductId && (
        <p className="text-sm text-gray-400 text-center py-4">Selecciona un producto para ver su historial</p>
      )}

      {selectedProductId && (
        <DataTable
          columns={columns}
          data={movements}
          loading={loading}
          keyExtractor={(m: InventoryMovement) => m.id}
          emptyMessage="Sin movimientos"
          emptyIcon={<History size={32} />}
          renderCardOnMobile
        />
      )}
    </div>
  );
}
