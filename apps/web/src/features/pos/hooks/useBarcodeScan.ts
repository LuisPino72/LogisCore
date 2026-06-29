import { useRef, useEffect, useCallback } from 'react';
import { inventoryService } from '../../inventory/services/inventoryService';
import { logger } from '../../../lib/logger';
import { audioService } from '../../../services/audioService';
import type { Product } from '../../../specs/inventory';

interface UseBarcodeScanOptions {
  tenantId: string | null;
  onProductFound: (product: Product) => Promise<void>;
  onWeightedProduct: (product: Product) => void;
  onPresentationNeeded: (product: Product) => void;
  onError: (message: string) => void;
}

export function useBarcodeScan({ tenantId, onProductFound, onWeightedProduct, onPresentationNeeded, onError }: UseBarcodeScanOptions) {
  const barcodeBuffer = useRef('');
  const lastKeyTime = useRef(0);
  const SCAN_TIMEOUT_MS = 120;
  const MAX_BARCODE_LENGTH = 50;

  const handleBarcodeScan = useCallback(async (code: string) => {
    if (!tenantId) return;
    const cleanCode = code.replace(/^00/, '').trim();
    if (cleanCode.length < 3) return;

    try {
      const productResult = await inventoryService.getProductBySku(tenantId, cleanCode);
      if (productResult.ok && productResult.data) {
        navigator.vibrate?.(50);
        audioService.scanSuccess();
        if (productResult.data.isWeighted) {
          onWeightedProduct(productResult.data);
        } else {
          const barcodeResult = await inventoryService.getPresentationByBarcode(tenantId, cleanCode);
          if (barcodeResult?.id) {
            await onProductFound(productResult.data);
          } else {
            await onProductFound(productResult.data);
          }
        }
        return;
      }

      const barcodeResult = await inventoryService.getPresentationByBarcode(tenantId, cleanCode);
      if (barcodeResult?.id) {
        onError(`Presentación "${barcodeResult.name}" no tiene un producto asociado por SKU`);
        return;
      }

      onError(`Producto no encontrado: "${cleanCode}"`);
    } catch (err) {
      logger.error('POS', 'Error escaneando código', err);
      onError('Error al escanear. Verifica tu conexión.');
    }
  }, [tenantId, onProductFound, onWeightedProduct, onPresentationNeeded, onError]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const now = Date.now();
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = barcodeBuffer.current;
        barcodeBuffer.current = '';
        if (code.length >= 3) {
          handleBarcodeScan(code);
        }
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length === 1 || e.key === 'Backspace') {
        if (now - lastKeyTime.current > SCAN_TIMEOUT_MS) {
          barcodeBuffer.current = '';
        }
        lastKeyTime.current = now;
        if (e.key === 'Backspace') {
          barcodeBuffer.current = barcodeBuffer.current.slice(0, -1);
        } else if (barcodeBuffer.current.length < MAX_BARCODE_LENGTH) {
          barcodeBuffer.current += e.key;
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleBarcodeScan]);

  return { handleBarcodeScan };
}
