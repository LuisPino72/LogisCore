import { Button, Input } from '../../../common/components';
import { Trash2, Minus, Plus } from 'lucide-react';
import type { CartItem } from '../types';

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
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-500">
          {item.isWeighted ? item.unit : 'u'} x $ {item.unitPriceUsd.toFixed(2)}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleStep(-step)}
          className="w-[44px] h-[44px] flex items-center justify-center rounded-lg bg-surface-alt hover:bg-gray-200 active:bg-gray-300 transition-colors"
          aria-label="Reducir cantidad"
        >
          <Minus size={16} />
        </button>
        <div className="w-16">
          <Input
            type="text"
            inputMode="decimal"
            step={step}
            value={item.quantity}
            onChange={handleChange}
            className="text-right py-1 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => handleStep(step)}
          className="w-[44px] h-[44px] flex items-center justify-center rounded-lg bg-surface-alt hover:bg-gray-200 active:bg-gray-300 transition-colors"
          aria-label="Aumentar cantidad"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="text-right shrink-0 min-w-16">
        <p className="text-sm font-semibold">$ {item.totalPriceUsd.toFixed(2)}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={<Trash2 size={16} />}
        onClick={() => onRemove(item.productId)}
        className="min-w-[44px] min-h-[44px]"
      />
    </div>
  );
}
