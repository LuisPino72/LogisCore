import { useRef, useCallback, useState } from 'react';

interface UseRepeatButtonOptions {
  onAction: (delta: number) => void;
  initialDelay?: number;
}

function getAcceleration(elapsed: number): { mult: number; interval: number } {
  if (elapsed < 2000) return { mult: 1, interval: 250 };
  if (elapsed < 4000) return { mult: 2, interval: 200 };
  if (elapsed < 6000) return { mult: 4, interval: 150 };
  return { mult: 8, interval: 100 };
}

export function useRepeatButton({ onAction, initialDelay = 500 }: UseRepeatButtonOptions) {
  const [isRepeating, setIsRepeating] = useState<'plus' | 'minus' | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const wasHoldingRef = useRef(false);

  const stopRepeat = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsRepeating(null);
  }, []);

  const startHold = useCallback((delta: number) => {
    stopRepeat();
    wasHoldingRef.current = false;
    setIsRepeating(delta > 0 ? 'plus' : 'minus');
    startTimeRef.current = Date.now();

    const tick = () => {
      wasHoldingRef.current = true;
      const elapsed = Date.now() - startTimeRef.current;
      const { mult, interval } = getAcceleration(elapsed);
      const acceleratedDelta = parseFloat((delta * mult).toFixed(2));
      onAction(acceleratedDelta);
      timerRef.current = setTimeout(tick, interval);
    };

    timerRef.current = setTimeout(tick, initialDelay);
  }, [onAction, initialDelay, stopRepeat]);

  const handleClick = useCallback((delta: number) => {
    if (wasHoldingRef.current) {
      wasHoldingRef.current = false;
      return;
    }
    onAction(delta);
  }, [onAction]);

  return { startHold, stopRepeat, handleClick, isRepeating };
}
