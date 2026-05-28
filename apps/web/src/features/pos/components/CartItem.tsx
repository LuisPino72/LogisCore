import { memo, useState, useRef, useCallback } from 'react';
import { Button, Input } from '../../../common/components';
import { Trash2, Minus, Plus } from 'lucide-react';
import type { CartItem } from '../types';
import { formatUsd, formatBs } from '@/lib/formatBs';
import { preciseRound } from '@logiscore/shared';
import { usePosStore } from '../stores/posStore';

interface CartItemRowProps {
  item: CartItem;
  onRemove: (productId: string, presentationId?: string) => void;
  onUpdateQuantity: (productId: string, quantity: number, presentationId?: string) => void;
}

const WEIGHABLE_PRESETS = [0.5, 1, 2, 5];

function getAcceleration(elapsed: number): { mult: number; interval: number } {
  if (elapsed < 2000) return { mult: 1, interval: 250 };
  if (elapsed < 4000) return { mult: 2, interval: 200 };
  if (elapsed < 6000) return { mult: 4, interval: 150 };
  return { mult: 8, interval: 100 };
}

export const CartItemRow = memo(function CartItemRow({ item, onRemove, onUpdateQuantity }: CartItemRowProps) {
  const step = item.isWeighted ? 0.01 : 1;
  const decimals = item.isWeighted ? 2 : 0;
  const exchangeRate = usePosStore((s) => s.exchangeRate);
  const priceBs = exchangeRate && exchangeRate > 0 ? formatBs(item.totalPriceUsd * exchangeRate) : null;

  const [localQty, setLocalQty] = useState<string | null>(null);
  const [isRepeating, setIsRepeating] = useState<'plus' | 'minus' | null>(null);

  const qtyRef = useRef(item.quantity);
  qtyRef.current = item.quantity;

  const repeatRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; startTime: number }>({
    timer: null,
    startTime: 0,
  });

  const wasHoldingRef = useRef(false);

  const applyDelta = useCallback((delta: number) => {
    setLocalQty(null);
    const currentQty = qtyRef.current;
    const next = Math.max(step, parseFloat((currentQty + delta).toFixed(decimals)));
    onUpdateQuantity(item.productId, next, item.presentationId);
  }, [step, decimals, onUpdateQuantity, item.productId]);

  const stopRepeat = useCallback(() => {
    if (repeatRef.current.timer) {
      clearTimeout(repeatRef.current.timer);
      repeatRef.current.timer = null;
    }
    setIsRepeating(null);
  }, []);

  const startHold = useCallback((delta: number) => {
    stopRepeat();
    wasHoldingRef.current = false;
    setIsRepeating(delta > 0 ? 'plus' : 'minus');
    repeatRef.current.startTime = Date.now();

    const tick = () => {
      wasHoldingRef.current = true;
      const elapsed = Date.now() - repeatRef.current.startTime;
      const { mult, interval } = getAcceleration(elapsed);
      const acceleratedStep = parseFloat((step * mult).toFixed(2));
      applyDelta(delta > 0 ? acceleratedStep : -acceleratedStep);
      repeatRef.current.timer = setTimeout(tick, interval);
    };

    repeatRef.current.timer = setTimeout(tick, 500);
  }, [applyDelta, step, stopRepeat]);

  const handleClick = useCallback((delta: number) => {
    if (wasHoldingRef.current) {
      wasHoldingRef.current = false;
      return;
    }
    applyDelta(delta);
  }, [applyDelta]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    if (item.isWeighted) {
      setLocalQty(raw);
      if (raw === '') return;
      const cleaned = raw.replace(/[^0-9.]/g, '');
      const parts = cleaned.split('.');
      if (parts.length > 2) return;
      const sanitized = (parts[0] || '0') + (parts.length > 1 ? '.' + parts[1].slice(0, 2) : '');
      let val = parseFloat(sanitized);
      if (!isNaN(val) && val > 0) {
        if (val > 99999) val = 99999;
        onUpdateQuantity(item.productId, preciseRound(val, 2), item.presentationId);
      }
      return;
    }

    const cleaned = raw.replace(/[^0-9.]/g, '').split('.')[0] || '0';
    let val = parseFloat(cleaned);
    if (!isNaN(val) && val > 0) {
      if (val > 99999) val = 99999;
      onUpdateQuantity(item.productId, val, item.presentationId);
    }
  };

  const displayQty = localQty ?? (item.isWeighted ? item.quantity.toFixed(2) : item.quantity.toString());

  const btnBase = 'w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-150 shadow-xs hover:shadow-sm';
  const btnIdle = 'bg-surface-alt hover:bg-gray-200/80 active:bg-gray-300';
  const btnActive = 'bg-primary/20 scale-95';

  return (
    <div className="py-2.5 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-col flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 wrap-break-word">{item.name}</p>
          {item.presentationName && (
            <span className="text-[11px] text-text-muted">{item.presentationName}</span>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-gray-900">{formatUsd(item.totalPriceUsd)}</p>
          {priceBs && <p className="text-[10px] text-text-muted">{priceBs}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500 shrink-0">
          {item.isWeighted ? item.unit : 'u'} x {formatUsd(item.unitPriceUsd)}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onMouseDown={() => startHold(-step)}
            onMouseUp={stopRepeat}
            onMouseLeave={stopRepeat}
            onTouchStart={() => startHold(-step)}
            onTouchEnd={stopRepeat}
            onTouchCancel={stopRepeat}
            onClick={() => handleClick(-step)}
            className={`${btnBase} ${isRepeating === 'minus' ? btnActive : btnIdle}`}
            aria-label="Reducir cantidad"
          >
            <Minus size={16} className={`transition-transform duration-150 ${isRepeating === 'minus' ? 'scale-110' : ''}`} />
          </button>

          <div className="w-16">
            <Input
              type="text"
              inputMode="decimal"
              step={step}
              value={displayQty}
              onChange={handleChange}
              validation={{ min: 0.01, max: 99999 }}
              className="text-center py-1.5 text-sm font-semibold"
            />
          </div>

          <button
            type="button"
            onMouseDown={() => startHold(step)}
            onMouseUp={stopRepeat}
            onMouseLeave={stopRepeat}
            onTouchStart={() => startHold(step)}
            onTouchEnd={stopRepeat}
            onTouchCancel={stopRepeat}
            onClick={() => handleClick(step)}
            className={`${btnBase} ${isRepeating === 'plus' ? btnActive : btnIdle}`}
            aria-label="Aumentar cantidad"
          >
            <Plus size={16} className={`transition-transform duration-150 ${isRepeating === 'plus' ? 'scale-110' : ''}`} />
          </button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(item.productId, item.presentationId)}
            className="p-2.5 min-w-11 min-h-11 ml-1"
          >
            <Trash2 size={16} className="text-danger" />
          </Button>
        </div>
      </div>

      {item.isWeighted && (
        <div className="flex flex-wrap gap-1.5 mt-2 justify-end">
          {WEIGHABLE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setLocalQty(null);
                onUpdateQuantity(item.productId, preset);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                item.quantity === preset
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-surface-alt border-border text-gray-600 hover:bg-gray-200'
              }`}
            >
              {preset} {item.unit}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
