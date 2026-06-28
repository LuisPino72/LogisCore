import { useState, useCallback } from 'react';

let globalSetMessage: ((msg: string) => void) | null = null;

export function showPermissionDenied(message: string) {
  globalSetMessage?.(message);
}

export function usePermissionDenied() {
  const [message, setMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const show = useCallback((msg: string) => {
    setMessage(msg);
    setIsOpen(true);
  }, []);

  const hide = useCallback(() => {
    setIsOpen(false);
    setMessage('');
  }, []);

  if (!globalSetMessage) {
    globalSetMessage = show;
  }

  return { message, isOpen, show, hide };
}
