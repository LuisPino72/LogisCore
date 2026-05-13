export { InventoryPage } from './components/InventoryPage';
export { ProductList } from './components/ProductList';
export { ProductForm } from './components/ProductForm';
export { CategoryManager } from './components/CategoryManager';
// StockAdjustmentModal removed — adjustment flow is now modal-driven from InventoryPage
export { MovementHistory } from './components/MovementHistory';
export { LowStockBadge } from './components/LowStockBadge';
export { useInventory } from './hooks/useInventory';
export { useProductForm } from './hooks/useProductForm';
export { useStockAlerts } from './hooks/useStockAlerts';
export { useInventoryStore } from './stores/inventoryStore';
export { inventoryService } from './services/inventoryService';
export type {
  Product,
  Category,
  InventoryMovement,
  CreateProductInput,
  ProductFormData,
  AdjustStockInput,
  InventoryState,
} from './types';
export { displayStock, convertToStorage, kgToGrams, gramsToKg, ltToMl, mlToLt } from './types';
