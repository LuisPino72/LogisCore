import { useState, useCallback, useMemo } from 'react';
import { preciseRound } from '@logiscore/shared';
import type { Product } from '../types';
import { inventoryService } from '../services/inventoryService';

export type BulkPriceMode = 'percentage' | 'fixed_amount' | 'fixed_price';

interface UseBulkPriceUpdateOptions {
  products: Product[];
  tenantId: string;
  onSuccess?: () => void;
}

interface PricePreview {
  productId: string;
  name: string;
  currentPrice: number;
  newPrice: number;
}

interface ImpactSummary {
  totalProducts: number;
  productsWithPrice: number;
  productsSkipped: number;
  minNewPrice: number;
  maxNewPrice: number;
  isDecreasing: boolean;
}

interface UseBulkPriceUpdateReturn {
  showModal: boolean;
  showConfirm: boolean;
  selectedIds: string[];
  mode: BulkPriceMode;
  value: string;
  submitting: boolean;
  error: string;
  preview: PricePreview[];
  impact: ImpactSummary | null;
  openModal: (productIds: string[]) => void;
  closeModal: () => void;
  proceedToConfirm: () => void;
  backToForm: () => void;
  setMode: (mode: BulkPriceMode) => void;
  setValue: (value: string) => void;
  handleSubmit: () => Promise<{ success: number; skipped: number; failed: number }>;
}

const MAX_PRICE = 999999.99;
const MIN_PRICE = 0.01;
const MAX_PERCENTAGE = 500;
const MAX_FIXED_AMOUNT = 999999;

function computeNewPrice(currentPrice: number, mode: BulkPriceMode, value: number): number {
  if (mode === 'percentage') {
    return currentPrice * (1 + value / 100);
  }
  if (mode === 'fixed_amount') {
    return currentPrice + value;
  }
  return value;
}

export function useBulkPriceUpdate({ products, tenantId, onSuccess }: UseBulkPriceUpdateOptions): UseBulkPriceUpdateReturn {
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<BulkPriceMode>('percentage');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedProducts = useMemo(
    () => selectedIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[],
    [selectedIds, products],
  );

  const impact = useMemo((): ImpactSummary | null => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return null;
    const productsWithPrice = selectedProducts.filter((p) => p.priceUsd > 0);
    const newPrices = productsWithPrice.map((p) => computeNewPrice(p.priceUsd, mode, numValue));
    const roundedPrices = newPrices.map((p) => preciseRound(p, 2));
    return {
      totalProducts: selectedProducts.length,
      productsWithPrice: productsWithPrice.length,
      productsSkipped: selectedProducts.length - productsWithPrice.length,
      minNewPrice: Math.min(...roundedPrices),
      maxNewPrice: Math.max(...roundedPrices),
      isDecreasing: mode === 'percentage' ? numValue < 0 : mode === 'fixed_amount' ? numValue < 0 : false,
    };
  }, [selectedProducts, mode, value]);

  const preview = useMemo(() => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return [];
    return selectedProducts.slice(0, 3).map((p) => ({
      productId: p.id,
      name: p.name,
      currentPrice: p.priceUsd,
      newPrice: computeNewPrice(p.priceUsd, mode, numValue),
    }));
  }, [selectedProducts, mode, value]);

  const openModal = useCallback((productIds: string[]) => {
    setSelectedIds(productIds);
    setMode('percentage');
    setValue('');
    setError('');
    setShowConfirm(false);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setShowConfirm(false);
    setSelectedIds([]);
    setError('');
  }, []);

  const proceedToConfirm = useCallback(() => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setShowConfirm(true);
  }, [value, mode, selectedProducts]);

  const backToForm = useCallback(() => {
    setShowConfirm(false);
    setError('');
  }, []);

  const validate = useCallback((): string | null => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      return 'Ingresa un valor para ajustar los precios';
    }
    if (mode === 'percentage' && numValue > MAX_PERCENTAGE) {
      return `El porcentaje no puede superar ${MAX_PERCENTAGE}%. Reduce el valor.`;
    }
    if (mode === 'fixed_amount' && numValue > MAX_FIXED_AMOUNT) {
      return `El monto no puede superar $${MAX_FIXED_AMOUNT}. Reduce el valor.`;
    }
    const productsWithPrice = selectedProducts.filter((p) => p.priceUsd > 0);
    if (productsWithPrice.length === 0) {
      return 'Ningún producto seleccionado tiene precio de venta para actualizar';
    }
    for (const p of productsWithPrice) {
      const newPrice = computeNewPrice(p.priceUsd, mode, numValue);
      if (newPrice < MIN_PRICE) {
        return `"${p.name}" quedaría en $${newPrice.toFixed(2)}, por debajo del mínimo ($${MIN_PRICE})`;
      }
      if (newPrice > MAX_PRICE) {
        return `"${p.name}" quedaría en $${newPrice.toFixed(2)}, excede el máximo ($${MAX_PRICE})`;
      }
    }
    return null;
  }, [value, mode, selectedProducts]);

  const handleSubmit = useCallback(async (): Promise<{ success: number; skipped: number; failed: number }> => {
    const numValue = parseFloat(value);
    setSubmitting(true);
    setError('');

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const product of selectedProducts) {
      if (product.priceUsd <= 0) {
        skipped++;
        continue;
      }
      const newPrice = computeNewPrice(product.priceUsd, mode, numValue);
      const roundedPrice = preciseRound(newPrice, 2);
      const updateInput: Partial<Product> = { priceUsd: roundedPrice };
      const result = await inventoryService.updateProduct(product.id, updateInput, tenantId);
      if (result.ok) {
        success++;
      } else {
        failed++;
      }
    }

    setSubmitting(false);
    if (success > 0) {
      setShowModal(false);
      setShowConfirm(false);
      setSelectedIds([]);
      onSuccess?.();
    }
    return { success, skipped, failed };
  }, [value, mode, selectedProducts, tenantId, onSuccess]);

  return {
    showModal,
    showConfirm,
    selectedIds,
    mode,
    value,
    submitting,
    error,
    preview,
    impact,
    openModal,
    closeModal,
    proceedToConfirm,
    backToForm,
    setMode,
    setValue,
    handleSubmit,
  };
}
