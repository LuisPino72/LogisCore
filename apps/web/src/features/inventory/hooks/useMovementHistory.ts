import { useState, useCallback, useEffect } from 'react';
import { inventoryService } from '../services/inventoryService';
import type { InventoryMovement } from '../../../specs/inventory';

interface UseMovementHistoryOptions {
  tenantId: string;
}

export function useMovementHistory({ tenantId }: UseMovementHistoryOptions) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [movements.length]);

  const handleProductChange = useCallback(async (productId: string) => {
    setSelectedProductId(productId);
    setPage(1);
    if (!productId) { setMovements([]); return; }
    setLoading(true);
    const result = await inventoryService.getMovementHistory(productId, tenantId);
    if (result.ok) setMovements(result.data);
    setLoading(false);
  }, [tenantId]);

  const clearSelection = useCallback(() => {
    setSelectedProductId('');
    setMovements([]);
  }, []);

  return {
    selectedProductId,
    setSelectedProductId,
    movements,
    page,
    setPage,
    loading,
    handleProductChange,
    clearSelection,
  };
}
