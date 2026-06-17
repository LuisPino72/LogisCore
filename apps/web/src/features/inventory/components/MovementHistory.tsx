import { useState, useMemo, useRef, useEffect } from 'react';
import { History, Package, ArrowDownLeft, ArrowUpRight, Minus } from 'lucide-react';
import { Card, SearchInput, Pagination } from '../../../common/components';
import { useFuzzySearch } from '../../../lib/useFuzzySearch';
import type { Product } from '../types';
import { displayStock } from '../types';
import { inventoryService } from '../services/inventoryService';
import type { InventoryMovement } from '../../../specs/inventory';

interface MovementHistoryProps {
  products: Product[];
  tenantId: string;
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

function getTypeConfig(type: string, quantity?: number) {
  const isAdjNeg = type === 'adjustment' && quantity != null && quantity < 0;
  const isAdjPos = type === 'adjustment' && quantity != null && quantity > 0;
  switch (type) {
    case 'sale':
      return { lightColor: 'bg-danger/10', icon: ArrowDownLeft, iconClass: 'text-danger', badge: 'danger' as const };
    case 'purchase':
      return { lightColor: 'bg-success/10', icon: ArrowUpRight, iconClass: 'text-success', badge: 'success' as const };
    case 'adjustment':
      if (isAdjNeg) return { lightColor: 'bg-danger/10', icon: ArrowDownLeft, iconClass: 'text-danger', badge: 'danger' as const };
      if (isAdjPos) return { lightColor: 'bg-success/10', icon: ArrowUpRight, iconClass: 'text-success', badge: 'success' as const };
      return { lightColor: 'bg-warning/10', icon: Minus, iconClass: 'text-warning', badge: 'warning' as const };
    default:
      return { lightColor: 'bg-gray-100', icon: Package, iconClass: 'text-gray-700', badge: 'info' as const };
  }
}

function getSignedQty(mov: InventoryMovement, prod?: Product): string {
  const sign = mov.type === 'sale' ? -1 : (mov.type === 'purchase' ? 1 : Math.sign(mov.quantity));
  const absQty = Math.abs(mov.quantity);
  if (prod?.isWeighted) {
    const display = displayStock(absQty, prod.unit);
    return `${sign >= 0 ? '+' : '-'}${display} ${prod.unit}`;
  }
  const signedQty = absQty * sign;
  return `${signedQty > 0 ? '+' : ''}${signedQty}`;
}

function formatDate(dateStr: string): { date: string; time: string } {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
    time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  };
}

const MOVEMENTS_PAGE_SIZE = 20;

export function MovementHistory({ products, tenantId }: MovementHistoryProps) {
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

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const handleProductChange = async (productId: string) => {
    setSelectedProductId(productId);
    setPage(1);
    setShowDropdown(false);
    setProductSearch('');
    if (!productId) { setMovements([]); return; }
    setLoading(true);
    const result = await inventoryService.getMovementHistory(productId, tenantId);
    if (result.ok) setMovements(result.data);
    setLoading(false);
  };

  const totalPages = Math.max(1, Math.ceil(movements.length / MOVEMENTS_PAGE_SIZE));
  const visibleMovements = movements.slice((page - 1) * MOVEMENTS_PAGE_SIZE, page * MOVEMENTS_PAGE_SIZE);

  const renderTimelineCard = (mov: InventoryMovement) => {
    const prod = productMap.get(mov.productId);
    const config = getTypeConfig(mov.type, mov.quantity);
    const Icon = config.icon;
    const qty = getSignedQty(mov, prod);
    const { date, time } = formatDate(mov.createdAt);
    const isNegative = (mov.type === 'sale') || (mov.type === 'adjustment' && mov.quantity < 0);
    const qtyColor = isNegative ? 'text-danger' : mov.type === 'purchase' || (mov.type === 'adjustment' && mov.quantity > 0) ? 'text-success' : 'text-gray-800';
    const badgeColor = isNegative ? 'text-danger' : mov.type === 'purchase' || (mov.type === 'adjustment' && mov.quantity > 0) ? 'text-success' : 'text-warning';

    const stockText = prod?.isWeighted
      ? `${displayStock(mov.previousStock, prod.unit)} → ${displayStock(mov.newStock, prod.unit)} ${prod.unit}`
      : mov.previousStock !== mov.newStock
        ? `${mov.previousStock} → ${mov.newStock}`
        : null;

    return (
      <div className="relative flex gap-3 py-3 pl-1 animate-fade-in">
        {/* Timeline dot + line */}
        <div className="flex flex-col items-center shrink-0">
          <div className={`w-8 h-8 rounded-full ${config.lightColor} flex items-center justify-center ring-2 ring-white z-10`}>
            <Icon size={14} className={config.iconClass} />
          </div>
          <div className="w-px flex-1 bg-gray-400 mt-1" />
        </div>

        {/* Content — mobile: stacked, desktop: horizontal */}
        <div className="flex-1 min-w-0 pb-1">
          {/* Mobile layout */}
          <div className="sm:hidden">
            <span className={`text-sm font-bold ${qtyColor}`}>{qty}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${config.lightColor} ${badgeColor}`}>
                {getTypeLabel(mov)}
              </span>
              <span className="text-[11px] text-gray-700 tabular-nums">{time}</span>
            </div>
            {stockText && (
              <div className="mt-1">
                <span className="text-[11px] text-gray-700">Stock</span>
                <p className="text-[11px] text-gray-700">{stockText}</p>
              </div>
            )}
            <span className="text-[10px] text-gray-700 mt-0.5 block">{date}</span>
          </div>

          {/* Desktop layout — horizontal */}
          <div className="hidden sm:flex items-center gap-4">
            <span className={`text-sm font-bold shrink-0 ${qtyColor}`}>{qty}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${config.lightColor} ${badgeColor}`}>
                {getTypeLabel(mov)}
              </span>
              <span className="text-[11px] text-gray-700 tabular-nums">{time}</span>
            </div>
            {stockText && (
              <span className="text-[11px] text-gray-700 truncate">Stock: {stockText}</span>
            )}
            <span className="text-[10px] text-gray-700 shrink-0 ml-auto tabular-nums">{date}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-10 w-full rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className="skeleton w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-1/3 rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 relative" ref={dropdownRef}>
        <label className="input-label">Seleccionar producto</label>
        <SearchInput
          maxLength={20}
          placeholder="Buscar por nombre o SKU"
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
            onClick={() => { setSelectedProductId(''); setMovements([]); setProductSearch(''); }}
            className="text-xs text-primary font-medium hover:underline min-h-11 py-2 px-3"
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
                <span className="font-medium">{p.name}</span>
              </button>
            ))}
          </div>
        )}
        {showDropdown && filteredProducts.length === 0 && (
          <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-4 text-sm text-gray-600 text-center">
            No hay productos. Crea productos primero desde Inventario.
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

      {selectedProductId && visibleMovements.length > 0 && (
        <div className="space-y-0">
          {visibleMovements.map((mov) => (
            <div key={mov.id} className="border-b border-gray-100 last:border-b-0">
              {renderTimelineCard(mov)}
            </div>
          ))}
        </div>
      )}

      {selectedProductId && visibleMovements.length === 0 && !loading && (
        <div className="py-12 text-center">
          <History size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Sin movimientos aún</p>
          <p className="text-xs text-gray-400 mt-1">Aparecerán cuando registres ventas, compras o ajustes.</p>
        </div>
      )}

      {selectedProductId && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
