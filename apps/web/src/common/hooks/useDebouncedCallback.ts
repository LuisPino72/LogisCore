import { useRef, useCallback, useEffect } from 'react';

export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  waitMs: number = 300,
  maxWaitMs: number = 1000,
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastArgsRef = useRef<Parameters<T> | null>(null);

  const debouncedFn = useCallback((...args: Parameters<T>) => {
    lastArgsRef.current = args;

    if (timerRef.current) clearTimeout(timerRef.current);

    if (!maxTimerRef.current && maxWaitMs > 0) {
      maxTimerRef.current = setTimeout(() => {
        maxTimerRef.current = null;
        timerRef.current = null;
        if (lastArgsRef.current) {
          callbackRef.current(...lastArgsRef.current);
          lastArgsRef.current = null;
        }
      }, maxWaitMs);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (maxTimerRef.current) {
        clearTimeout(maxTimerRef.current);
        maxTimerRef.current = null;
      }
      callbackRef.current(...args);
      lastArgsRef.current = null;
    }, waitMs);
  }, [waitMs, maxWaitMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    };
  }, []);

  return debouncedFn;
}
