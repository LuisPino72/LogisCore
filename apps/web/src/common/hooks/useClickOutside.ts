import { type RefObject, useEffect } from 'react';

export function useClickOutside<T extends HTMLElement>(
  refs: RefObject<T | null> | RefObject<T | null>[],
  handler: () => void,
): void {
  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      const refsArray = Array.isArray(refs) ? refs : [refs];
      const isInside = refsArray.some(ref => ref.current?.contains(e.target as Node));
      if (isInside) return;
      handler();
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [refs, handler]);
}
