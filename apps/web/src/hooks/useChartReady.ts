import { useEffect, useRef, useState } from 'react';

export function useChartReady(): [boolean, (node: HTMLDivElement | null) => void] {
  const [ready, setReady] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = (node: HTMLDivElement | null) => {
    if (!node) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setReady(true);
          ro.disconnect();
          observerRef.current = null;
          break;
        }
      }
    });

    ro.observe(node);
    observerRef.current = ro;
  };

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return [ready, ref];
}
