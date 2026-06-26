import { useState, useMemo } from 'react';
import { ShoppingBag, AlertTriangle } from 'lucide-react';
import { Badge, Modal, Button } from '../../../common/components';
import { TableCard } from './TableCard';
import { ParkedCartsList } from './ParkedCartsList';
import type { ParkedCart } from '../types';
import { formatTime } from '@/lib/formatBs';
import { TABLE_COUNT } from '../constants';
import { MAX_PARKED_CARTS } from '../../../specs/pos';

interface TableGridProps {
  carts: ParkedCart[];
  onLoad: (cart: ParkedCart) => void;
  onDelete: (id: string) => void;
  onParkTable: (tableNumber: number) => void;
  selectedTableNumber?: number | null;
}

type ViewMode = 'list' | 'tables';

const tables = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);

export function TableGrid({ carts, onLoad, onDelete, onParkTable, selectedTableNumber }: TableGridProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('pos_view_mode') as ViewMode) || 'list';
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('pos_view_mode', mode);
  };

  const tableMap = useMemo(() => {
    const map = new Map<number, ParkedCart>();
    carts.forEach((cart) => {
      const match = cart.name.match(/Mesa\s*(\d+)/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n >= 1 && n <= TABLE_COUNT) {
          map.set(n, cart);
        }
      }
    });
    return map;
  }, [carts]);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: number } | null>(null);

  return (
    <div className="px-3 pb-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ShoppingBag size={16} className="text-primary" />
          <h4 className="text-sm font-semibold text-gray-700">
            {viewMode === 'list' ? 'Ventas en cola' : 'Mesas'}
          </h4>
          <Badge variant="info">{viewMode === 'tables' ? tableMap.size : carts.length}/{viewMode === 'tables' ? TABLE_COUNT : MAX_PARKED_CARTS}</Badge>
        </div>
        <div className="flex bg-gray-100 p-0.5 rounded-xl">
          <button
            onClick={() => handleViewModeChange('list')}
            className={`px-3 py-2.5 text-xs font-medium rounded-lg transition-all min-h-11 ${
              viewMode === 'list' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Lista
          </button>
          <button
            onClick={() => handleViewModeChange('tables')}
            className={`px-3 py-2.5 text-xs font-medium rounded-lg transition-all min-h-11 ${
              viewMode === 'tables' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Mesas
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <ParkedCartsList carts={carts} onLoad={onLoad} onDelete={onDelete} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 animate-card-in">
          {tables.map((n) => {
            const cart = tableMap.get(n);
            const isSelected = selectedTableNumber === n;
            if (cart) {
              const totalUsd = cart.cart.reduce((sum, item) => sum + item.totalPriceUsd, 0);
              const totalItems = cart.cart.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <TableCard
                  key={n}
                  number={n}
                  isOccupied
                  isSelected={isSelected}
                  totalUsd={totalUsd}
                  totalItems={totalItems}
                  time={formatTime(cart.createdAt)}
                  onClick={() => onLoad(cart)}
                  onDelete={() => setDeleteTarget({ id: cart.id, number: n })}
                />
              );
            }
            return (
              <TableCard key={n} number={n} isOccupied={false} isSelected={isSelected} onClick={() => onParkTable(n)} />
            );
          })}
        </div>
      )}

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Liberar mesa"
        size="sm"
      >
        <div className="flex flex-col items-center gap-3 pt-1 pb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-danger/10">
            <AlertTriangle size={20} className="text-danger" />
          </div>
          <p className="text-sm text-gray-600 text-center">
            ¿Liberar <strong>Mesa {deleteTarget?.number}</strong>? Se eliminará el pedido actual.
          </p>
          <p className="text-xs text-gray-400">Esta acción no se puede deshacer.</p>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" fullWidth onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              if (deleteTarget) {
                onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }
            }}
          >
            Liberar mesa
          </Button>
        </div>
      </Modal>
    </div>
  );
}
