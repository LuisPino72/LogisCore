import { useState, useCallback } from 'react';
import type { Product, AdjustmentReason } from '../types';
import { toDisplayValue } from '../types';
import { inventoryService } from '../services/inventoryService';

interface UseStockAdjustmentOptions {
  products: Product[];
  onAdjustStock: (productId: string, quantity: number, reasonType: AdjustmentReason, costTotal?: number) => Promise<boolean>;
  onSuccess?: () => void;
}

interface UseStockAdjustmentReturn {
  showAdjustment: boolean;
  adjProductId: string;
  adjMode: 'sumar' | 'restar' | '';
  adjQuantity: string;
  adjReasonType: string;
  adjCostTotal: string;
  adjShowCostInput: boolean;
  adjHasCost: boolean;
  adjError: string;
  adjSubmitting: boolean;
  openAdjustment: (productId: string) => void;
  closeAdjustment: () => void;
  setAdjMode: (mode: 'sumar' | 'restar' | '') => void;
  setAdjQuantity: (qty: string) => void;
  setAdjReasonType: (reason: string) => void;
  setAdjCostTotal: (cost: string) => void;
  setAdjShowCostInput: (show: boolean) => void;
  setAdjError: (error: string) => void;
  handleSubmitAdjustment: () => Promise<void>;
  checkProductCost: (productId: string) => Promise<void>;
}

export function useStockAdjustment({ products, onAdjustStock, onSuccess }: UseStockAdjustmentOptions): UseStockAdjustmentReturn {
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjProductId, setAdjProductId] = useState<string>('');
  const [adjMode, setAdjMode] = useState<'sumar' | 'restar' | ''>('');
  const [adjQuantity, setAdjQuantity] = useState('');
  const [adjReasonType, setAdjReasonType] = useState<string>('');
  const [adjCostTotal, setAdjCostTotal] = useState('');
  const [adjShowCostInput, setAdjShowCostInput] = useState(false);
  const [adjHasCost, setAdjHasCost] = useState(true);
  const [adjError, setAdjError] = useState('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  const openAdjustment = useCallback((productId: string) => {
    setAdjProductId(productId);
    setShowAdjustment(true);
    setAdjMode('');
    setAdjQuantity('');
    setAdjReasonType('');
    setAdjCostTotal('');
    setAdjShowCostInput(false);
    setAdjHasCost(true);
    setAdjError('');
  }, []);

  const closeAdjustment = useCallback(() => {
    setShowAdjustment(false);
    setAdjProductId('');
    setAdjMode('');
    setAdjHasCost(true);
    setAdjError('');
  }, []);

  const handleSubmitAdjustment = useCallback(async () => {
    if (!adjMode) { setAdjError('Selecciona si quieres sumar o restar stock'); return; }
    const rawQty = parseFloat(adjQuantity);
    if (isNaN(rawQty) || rawQty <= 0) { setAdjError('Ingresa una cantidad válida mayor a 0'); return; }
    if (!adjReasonType) { setAdjError('Selecciona un motivo para el ajuste'); return; }

    const product = products.find((p) => p.id === adjProductId);
    if (product && !product.isWeighted && rawQty !== Math.floor(rawQty)) {
      setAdjError('Los productos por unidad solo aceptan números enteros');
      return;
    }
    if (product?.isWeighted && adjQuantity && !/^\d+\.?\d{0,2}$/.test(adjQuantity)) {
      setAdjError('Los productos pesables aceptan máximo 2 decimales');
      return;
    }

    if (adjMode === 'restar') {
      if (product) {
        const maxStock = toDisplayValue(product.stock, product.unit);
        if (rawQty > maxStock) {
          const unitLabel = product.unit === 'kg' ? 'Kg' : product.unit === 'lt' ? 'Lt' : product.unit === 'm' ? 'm' : 'unidades';
          setAdjError(`No puedes restar más de ${maxStock} ${unitLabel} (stock actual)`);
          return;
        }
      }
    }

    const qty = adjMode === 'restar' ? -rawQty : rawQty;

    setAdjSubmitting(true);
    setAdjError('');
    const ok = await onAdjustStock(
      adjProductId,
      qty,
      adjReasonType as AdjustmentReason,
      adjShowCostInput && adjCostTotal ? parseFloat(adjCostTotal) : undefined,
    );
    setAdjSubmitting(false);

    if (ok) {
      setAdjQuantity('');
      setAdjReasonType('');
      setAdjCostTotal('');
      setAdjShowCostInput(false);
      setAdjHasCost(true);
      setAdjMode('');
      setAdjProductId('');
      setShowAdjustment(false);
      onSuccess?.();
    } else {
      setAdjError('Error al ajustar stock. Verifica el stock disponible.');
    }
  }, [adjMode, adjQuantity, adjReasonType, adjProductId, adjShowCostInput, adjCostTotal, products, onAdjustStock, onSuccess]);

  const checkProductCost = useCallback(async (productId: string) => {
    const result = await inventoryService.getProductLots(productId);
    if (result.ok) {
      setAdjHasCost(result.data.some((l) => (l.costUsdPerUnit ?? 0) > 0));
    }
  }, []);

  return {
    showAdjustment,
    adjProductId,
    adjMode,
    adjQuantity,
    adjReasonType,
    adjCostTotal,
    adjShowCostInput,
    adjHasCost,
    adjError,
    adjSubmitting,
    openAdjustment,
    closeAdjustment,
    setAdjMode,
    setAdjQuantity,
    setAdjReasonType,
    setAdjCostTotal,
    setAdjShowCostInput,
    setAdjError,
    handleSubmitAdjustment,
    checkProductCost,
  };
}
