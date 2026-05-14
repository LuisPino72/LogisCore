import { Button, Badge } from '../../../common/components';
import { ShoppingBag, Trash2, Clock } from 'lucide-react';
import type { ParkedCart } from '../types';

interface ParkedCartsListProps {
  carts: ParkedCart[];
  onLoad: (cart: ParkedCart) => void;
  onDelete: (id: string) => void;
}

export function ParkedCartsList({ carts, onLoad, onDelete }: ParkedCartsListProps) {
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
      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
        {carts.map((cart) => {
          const totalItems = cart.cart.reduce((sum, item) => sum + item.quantity, 0);
          const totalUsd = cart.cart.reduce((sum, item) => sum + item.totalPriceUsd, 0);
          return (
            <div
              key={cart.id}
              className="flex items-center gap-2 p-2 rounded-lg border border-border bg-surface-alt hover:bg-white transition-colors"
            >
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onLoad(cart)}>
                <p className="text-sm font-medium text-gray-800 truncate">{cart.name}</p>
                <p className="text-xs text-gray-500">
                  {totalItems} items · $ {totalUsd.toFixed(2)} ·{' '}
                  <span className="inline-flex items-center gap-0.5">
                    <Clock size={10} />
                    {fmtTime(cart.createdAt)}
                  </span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => onDelete(cart.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
