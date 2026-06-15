import { useState, useEffect, useCallback, useRef } from 'react';

interface KeyboardLayoutState {
  isKeyboardOpen: boolean;
  keyboardHeight: number;
  contentStyle: React.CSSProperties;
}

const KEYBOARD_THRESHOLD = 150;

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || navigator.maxTouchPoints > 0;
}

export function useKeyboardLayout(): KeyboardLayoutState {
  const [state, setState] = useState<KeyboardLayoutState>({
    isKeyboardOpen: false,
    keyboardHeight: 0,
    contentStyle: {},
  });
  const isMobileRef = useRef(isMobileDevice());

  const updateKeyboardHeight = useCallback(() => {
    if (!isMobileRef.current) {
      setState({ isKeyboardOpen: false, keyboardHeight: 0, contentStyle: {} });
      return;
    }

    const vp = window.visualViewport;
    if (!vp) return;

    const keyboardHeight = Math.max(
      0,
      window.innerHeight - vp.height - vp.offsetTop
    );

    const isKeyboardOpen = keyboardHeight > KEYBOARD_THRESHOLD;
    const height = isKeyboardOpen ? keyboardHeight : 0;

    document.documentElement.style.setProperty('--kb-height', `${height}px`);

    setState({
      isKeyboardOpen,
      keyboardHeight: height,
      contentStyle: isKeyboardOpen
        ? { paddingBottom: `${height}px` }
        : {},
    });
  }, []);

  useEffect(() => {
    isMobileRef.current = isMobileDevice();

    const vp = window.visualViewport;
    if (!vp) return;

    vp.addEventListener('resize', updateKeyboardHeight);
    vp.addEventListener('scroll', updateKeyboardHeight);
    updateKeyboardHeight();

    return () => {
      vp.removeEventListener('resize', updateKeyboardHeight);
      vp.removeEventListener('scroll', updateKeyboardHeight);
      document.documentElement.style.removeProperty('--kb-height');
    };
  }, [updateKeyboardHeight]);

  return state;
}
