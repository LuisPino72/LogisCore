import { Button, Input } from '../../../common/components';
import { Trash2, Minus, Plus } from 'lucide-react';
import type { CartItem } from '../types';
import { formatUsd } from '@/lib/formatBs';

interface CartItemRowProps {
  item: CartItem;
  onRemove: (productId: string) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
}

export function CartItemRow({ item, onRemove, onUpdateQuantity }: CartItemRowProps) {
  const step = item.isWeighted ? 0.01 : 1;
  const decimals = item.isWeighted ? 2 : 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    const sanitized = decimals > 0
      ? (parts[0] || '0') + (parts.length > 1 ? '.' + parts[1].slice(0, decimals) : '')
      : parts[0] || '0';
    const val = parseFloat(sanitized);
    if (!isNaN(val) && val > 0) {
      onUpdateQuantity(item.productId, val);
    }
  };

  const handleStep = (delta: number) => {
    const next = Math.max(step, parseFloat((item.quantity + delta).toFixed(decimals)));
    onUpdateQuantity(item.productId, next);
  };

  return (
    <div className="py-2.5 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-gray-800 truncate flex-1">{item.name}</p>
        <p className="text-sm font-semibold text-gray-900 shrink-0">{formatUsd(item.totalPriceUsd)}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {item.isWeighted ? item.unit : 'u'} x {formatUsd(item.unitPriceUsd)}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStep(-step)}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-alt hover:bg-gray-200 active:bg-gray-300 transition-colors"
            aria-label="Reducir cantidad"
          >
            <Minus size={14} />
          </button>
          <div className="w-14">
            <Input
              type="text"
              inputMode="decimal"
              step={step}
              value={item.quantity}
              onChange={handleChange}
              className="text-center py-1 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => handleStep(step)}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-alt hover:bg-gray-200 active:bg-gray-300 transition-colors"
            aria-label="Aumentar cantidad"
          >
            <Plus size={14} />
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(item.productId)}
            className="p-2 min-w-10 min-h-10 ml-1"
          >
            <Trash2 size={14} className="text-danger" />
          </Button>
        </div>
      </div>
    </div>
  );
}
