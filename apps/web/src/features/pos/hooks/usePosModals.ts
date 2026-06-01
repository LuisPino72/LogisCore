import { useState, useCallback } from 'react';
import type { Product } from '../../../specs/inventory';
import type { PaymentMethod } from '../types';

export function usePosModals() {
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showParkModal, setShowParkModal] = useState(false);
  const [cashMode, setCashMode] = useState<'open' | 'close'>('open');
  const [weightingProduct, setWeightingProduct] = useState<Product | null>(null);
  const [weightingQty, setWeightingQty] = useState('');
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [selectedProductForPres, setSelectedProductForPres] = useState<Product | null>(null);
  const [voidConfirmId, setVoidConfirmId] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<{ saleId: string; subtotalBs: number; totalUsd: number; totalBs: number; paymentMethod: PaymentMethod; items: Array<{ name: string; quantity: number; unitPriceUsd: number; totalPriceUsd: number; presentationName?: string; unit?: string }>; exchangeRate: number } | null>(null);

  const openWeightModal = useCallback((product: Product) => {
    setWeightingProduct(product);
    setWeightingQty('');
    setShowWeightModal(true);
  }, []);

  const closeWeightModal = useCallback(() => {
    setShowWeightModal(false);
    setWeightingProduct(null);
    setWeightingQty('');
  }, []);

  const openCashModal = useCallback((mode: 'open' | 'close') => {
    setCashMode(mode);
    setShowCashModal(true);
  }, []);

  const closeCashModal = useCallback(() => setShowCashModal(false), []);

  const openParkModal = useCallback(() => setShowParkModal(true), []);
  const closeParkModal = useCallback(() => setShowParkModal(false), []);

  const openPresModal = useCallback((product: Product) => setSelectedProductForPres(product), []);
  const closePresModal = useCallback(() => setSelectedProductForPres(null), []);

  return {
    showWeightModal, weightingProduct, weightingQty, setWeightingQty,
    showCashModal, cashMode,
    showParkModal,
    showBarcodeScanner, setShowBarcodeScanner,
    selectedProductForPres,
    voidConfirmId, setVoidConfirmId,
    completedSale, setCompletedSale,
    openWeightModal, closeWeightModal,
    openCashModal, closeCashModal,
    openParkModal, closeParkModal,
    openPresModal, closePresModal,
  };
}
