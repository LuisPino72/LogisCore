import { useState, useCallback } from 'react';

export type PosTab = 'sell' | 'history' | 'orders';

export function usePosNavigation() {
  const [activeTab, setActiveTab] = useState<PosTab>('sell');
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const switchToSell = useCallback(() => setActiveTab('sell'), []);
  const switchToHistory = useCallback(() => setActiveTab('history'), []);
  const switchToOrders = useCallback(() => setActiveTab('orders'), []);
  const toggleMobileCart = useCallback(() => setMobileCartOpen((prev) => !prev), []);
  const closeMobileCart = useCallback(() => setMobileCartOpen(false), []);

  return {
    activeTab, mobileCartOpen,
    switchToSell, switchToHistory, switchToOrders, toggleMobileCart, closeMobileCart,
  };
}
