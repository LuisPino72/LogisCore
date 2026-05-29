import { useState, useEffect } from 'react';

interface ViewportState {
  height: number;
  offsetTop: number;
  scale: number;
}

const INITIAL: ViewportState = {
  height: typeof window !== 'undefined' ? window.innerHeight : 900,
  offsetTop: 0,
  scale: 1,
};

export function useVisualViewport(): ViewportState {
  const [state, setState] = useState<ViewportState>(INITIAL);

  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;

    const update = () => {
      setState({
        height: vp.height,
        offsetTop: vp.offsetTop,
        scale: vp.scale,
      });
    };

    vp.addEventListener('resize', update);
    vp.addEventListener('scroll', update);
    update();

    return () => {
      vp.removeEventListener('resize', update);
      vp.removeEventListener('scroll', update);
    };
  }, []);

  return state;
}
