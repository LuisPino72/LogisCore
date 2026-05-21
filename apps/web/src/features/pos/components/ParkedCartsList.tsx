import { useState } from 'react';
import { Button, Badge, Modal } from '../../../common/components';
import { ShoppingBag, Trash2, Clock, AlertTriangle } from 'lucide-react';
import type { ParkedCart } from '../types';
import { formatUsd } from '@/lib/formatBs';

interface ParkedCartsListProps {
  carts: ParkedCart[];
  onLoad: (cart: ParkedCart) => void;
  onDelete: (id: string) => void;
}

export function ParkedCartsList({ carts, onLoad, onDelete }: ParkedCartsListProps) {
  const [deleteTarget, setDeleteTarget] = useState<ParkedCart | null>(null);

  if (carts.length === 0) return null;

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="px-3 pb-2">
      <div className="flex items-center gap-2 mb-2">
        <ShoppingBag size={16} className="text-primary" />
        <h4 className="text-sm font-semibold text-gray-700">Ventas en cola</h4>
        <Badge variant="info">{carts.length}/10</Badge>
      </div>
      <div className="flex flex-col gap-2 max-h-32 md:max-h-48 overflow-y-auto">
        {carts.map((cart) => {
          const totalItems = cart.cart.reduce((sum, item) => sum + item.quantity, 0);
          const totalUsd = cart.cart.reduce((sum, item) => sum + item.totalPriceUsd, 0);
          return (
            <div
              key={cart.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-white hover:bg-surface-alt transition-all cursor-pointer shadow-xs hover:shadow-sm"
              onClick={() => onLoad(cart)}
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ShoppingBag size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{cart.name}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                  <span className="font-medium text-gray-700">{formatUsd(totalUsd)}</span>
                  <span className="text-gray-300">·</span>
                  <span>{totalItems} items</span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Clock size={10} />
                    {fmtTime(cart.createdAt)}
                  </span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={16} />}
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(cart); }}
                className="min-w-11 min-h-11"
              />
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar venta en cola"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-danger" />
            </div>
            <div>
              <p className="text-sm font-semibold">¿Eliminar "{deleteTarget?.name}"?</p>
              <p className="text-xs text-gray-500">Esta acción no se puede deshacer.</p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
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
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
