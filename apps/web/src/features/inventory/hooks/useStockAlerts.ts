import { useEffect, useRef } from 'react';
import { useInventoryStore } from '../stores/inventoryStore';

export function useStockAlerts(tenantId: string | null) {
  const lowStockProducts = useInventoryStore((s) => s.lowStockProducts);
  const fetchProducts = useInventoryStore((s) => s.fetchProducts);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!tenantId || doneRef.current) return;
    doneRef.current = true;
    fetchProducts(tenantId);
  }, [tenantId, fetchProducts]);

  return {
    lowStockProducts,
    totalLowStock: lowStockProducts.length,
  };
}
