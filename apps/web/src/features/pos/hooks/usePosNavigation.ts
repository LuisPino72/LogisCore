import { useState, useCallback } from 'react';

export function usePosNavigation() {
  const [activeTab, setActiveTab] = useState<'sell' | 'history'>('sell');
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const switchToSell = useCallback(() => setActiveTab('sell'), []);
  const switchToHistory = useCallback(() => setActiveTab('history'), []);
  const toggleMobileCart = useCallback(() => setMobileCartOpen((prev) => !prev), []);
  const closeMobileCart = useCallback(() => setMobileCartOpen(false), []);

  return {
    activeTab, mobileCartOpen,
    switchToSell, switchToHistory, toggleMobileCart, closeMobileCart,
  };
}
