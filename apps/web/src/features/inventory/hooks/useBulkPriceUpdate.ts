import { useState, useCallback, useMemo } from 'react';
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

interface UseBulkPriceUpdateReturn {
  showModal: boolean;
  selectedIds: string[];
  mode: BulkPriceMode;
  value: string;
  includeCost: boolean;
  submitting: boolean;
  error: string;
  preview: PricePreview[];
  openModal: (productIds: string[]) => void;
  closeModal: () => void;
  setMode: (mode: BulkPriceMode) => void;
  setValue: (value: string) => void;
  setIncludeCost: (include: boolean) => void;
  handleSubmit: () => Promise<{ success: number; skipped: number; failed: number }>;
}

const MAX_PRICE = 999999.99;
const MIN_PRICE = 0.01;
const MAX_PERCENTAGE = 500;

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<BulkPriceMode>('percentage');
  const [value, setValue] = useState('');
  const [includeCost, setIncludeCost] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedProducts = useMemo(
    () => selectedIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[],
    [selectedIds, products],
  );

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
    setIncludeCost(false);
    setError('');
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setSelectedIds([]);
    setError('');
  }, []);

  const validate = useCallback((): string | null => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      return 'Ingresa un valor mayor a 0';
    }
    if (mode === 'percentage' && numValue > MAX_PERCENTAGE) {
      return `Porcentaje demasiado alto (máximo ${MAX_PERCENTAGE}%)`;
    }
    const productsWithPrice = selectedProducts.filter((p) => p.priceUsd > 0);
    if (productsWithPrice.length === 0) {
      return 'Ningún producto seleccionado tiene precio de venta';
    }
    for (const p of productsWithPrice) {
      const newPrice = computeNewPrice(p.priceUsd, mode, numValue);
      if (newPrice < MIN_PRICE) {
        return `"${p.name}" tendría precio menor a $${MIN_PRICE}`;
      }
      if (newPrice > MAX_PRICE) {
        return `"${p.name}" excede el precio máximo ($${MAX_PRICE})`;
      }
    }
    return null;
  }, [value, mode, selectedProducts]);

  const handleSubmit = useCallback(async (): Promise<{ success: number; skipped: number; failed: number }> => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return { success: 0, skipped: 0, failed: 0 };
    }

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
      const roundedPrice = Math.round(newPrice * 100) / 100;
      const updateInput: Partial<Product> = { priceUsd: roundedPrice };
      if (includeCost) {
        updateInput.costPrice = roundedPrice;
      }
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
      setSelectedIds([]);
      onSuccess?.();
    }
    return { success, skipped, failed };
  }, [validate, value, mode, selectedProducts, includeCost, tenantId, onSuccess]);

  return {
    showModal,
    selectedIds,
    mode,
    value,
    includeCost,
    submitting,
    error,
    preview,
    openModal,
    closeModal,
    setMode,
    setValue,
    setIncludeCost,
    handleSubmit,
  };
}
