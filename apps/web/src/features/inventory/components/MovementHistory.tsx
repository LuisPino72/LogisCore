import { useState, useMemo, useRef, useEffect } from 'react';
import { History, TrendingUp, TrendingDown, Package } from 'lucide-react';
import { Badge, DataTable, Card, SearchInput, Pagination } from '../../../common/components';
import { useFuzzySearch } from '../../../lib/useFuzzySearch';
import type { Column } from '../../../common/components';
import type { Product } from '../types';
import { displayStock } from '../types';
import { inventoryService } from '../services/inventoryService';
import type { InventoryMovement } from '../../../specs/inventory';

interface MovementHistoryProps {
  products: Product[];
}

const REASON_TYPE_LABELS: Record<string, string> = {
  inventario_inicial: 'Inventario inicial',
  ajuste_manual: 'Ajuste manual',
  perdida: 'Pérdida',
  robo: 'Robo',
  vencido: 'Vencido',
  consumo_interno: 'Consumo interno',
  otros: 'Otros',
};

function getTypeLabel(mov: InventoryMovement) {
  if (mov.type === 'adjustment' && mov.reasonType) return REASON_TYPE_LABELS[mov.reasonType] ?? mov.reasonType;
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

const MOVEMENTS_PAGE_SIZE = 20;

export function MovementHistory({ products }: MovementHistoryProps) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(1);
  }, [movements.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProducts = useFuzzySearch(products, productSearch, { keys: ['name', 'sku'] });

  const handleProductChange = async (productId: string) => {
    setSelectedProductId(productId);
    setPage(1);
    setShowDropdown(false);
    setProductSearch('');
    if (!productId) { setMovements([]); return; }
    setLoading(true);
    const result = await inventoryService.getMovementHistory(productId);
    if (result.ok) setMovements(result.data);
    setLoading(false);
  };

  const totalPages = Math.max(1, Math.ceil(movements.length / MOVEMENTS_PAGE_SIZE));
  const visibleMovements = movements.slice((page - 1) * MOVEMENTS_PAGE_SIZE, page * MOVEMENTS_PAGE_SIZE);

  const columns = useMemo((): Column<InventoryMovement>[] => [
    {
      key: 'type',
      header: 'Movimiento',
      render: (mov) => {
        const prod = products.find((p) => p.id === mov.productId);
        const sign = mov.type === 'sale' ? -1 : (mov.type === 'purchase' ? 1 : Math.sign(mov.quantity));
        const signedQty = Math.abs(mov.quantity) * sign;
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {getTypeIcon(mov.type)}
              <Badge variant={getTypeBadge(mov.type)}>{getTypeLabel(mov)}</Badge>
            </div>
            <p className="text-sm font-semibold">
              {signedQty > 0 ? '+' : ''}{prod?.isWeighted ? displayStock(Math.abs(mov.quantity), prod.unit) : signedQty}{prod?.isWeighted ? ` ${prod.unit}` : ''}
            </p>
            <span className="text-[10px] text-gray-600">
              {new Date(mov.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
          return <span className="text-xs text-gray-600">{mov.previousStock} → {mov.newStock}</span>;
        }
        return (
          <span className="text-xs text-gray-600">
            {displayStock(mov.previousStock, prod.unit)} → {displayStock(mov.newStock, prod.unit)} {prod.unit}
          </span>
        );
      },
    },
    {
      key: 'date',
      header: 'Fecha',
      hideOnMobile: true,
      className: 'text-right',
      render: (mov) => (
        <span className="text-[14px] text-gray-600">
          {new Date(mov.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
  ], [products]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-10 w-full rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2" ref={dropdownRef}>
        <label className="input-label">Seleccionar producto</label>
        <SearchInput
          maxLength={20}
          placeholder="Buscar por nombre o sku"
          value={selectedProductId
            ? (products.find((p) => p.id === selectedProductId)?.name ?? '')
            : productSearch}
          onChange={(e) => {
            if (selectedProductId) {
              setSelectedProductId('');
              setMovements([]);
            }
            setProductSearch(e.target.value);
            setShowDropdown(true);
          }}
          onClear={() => {
            setSelectedProductId('');
            setMovements([]);
            setProductSearch('');
            setShowDropdown(false);
          }}
          onFocus={() => {
            if (selectedProductId) {
              setSelectedProductId('');
              setMovements([]);
              setProductSearch('');
            }
            setShowDropdown(true);
          }}
        />
        {selectedProductId && (
          <button
            type="button"
            onClick={() => { setSelectedProductId(''); setMovements([]); }}
            className="text-xs text-primary font-medium hover:underline"
          >
            Limpiar selección
          </button>
        )}
        {showDropdown && filteredProducts.length > 0 && (
          <div className="absolute z-30 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm transition-colors min-h-11 ${
                  selectedProductId === p.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => handleProductChange(p.id)}
              >
                <span className="font-medium">{p.name}</span>              </button>
            ))}
          </div>
        )}
        {showDropdown && filteredProducts.length === 0 && (
          <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-4 text-sm text-gray-400 text-center">
            No hay productos
          </div>
        )}
      </div>

      {!selectedProductId && (
        <Card className="p-8 text-center">
          <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <History size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">Elige un producto</p>
          <p className="text-xs text-text-secondary mt-1">Selecciona un producto de la lista para ver su historial de movimientos</p>
        </Card>
      )}

      {selectedProductId && (
        <>
          <DataTable
            columns={columns}
            data={visibleMovements}
            loading={loading}
            keyExtractor={(m: InventoryMovement) => m.id}
            emptyMessage="Sin movimientos aún"
            emptyIcon={<History size={32} />}
            renderCardOnMobile
          />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
