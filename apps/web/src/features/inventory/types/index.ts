import type { z } from 'zod';
import type { ProductSchema, CategorySchema, InventoryMovementSchema, CreateProductInputSchema, PresentationSchema, CreatePresentationInputSchema } from '../../../specs/inventory';
import type { ProductType } from '../../../specs/inventory';

export type Product = z.infer<typeof ProductSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;
export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;

export type Presentation = z.infer<typeof PresentationSchema>;
export type CreatePresentationInput = z.infer<typeof CreatePresentationInputSchema>;

export type { ProductType };

export type AdjustmentReason =
  | 'inventario_inicial'
  | 'ajuste_manual'
  | 'perdida'
  | 'robo'
  | 'vencido'
  | 'consumo_interno'
  | 'otros';

export interface UpdatePresentationInput {
  name?: string;
  priceUsd?: number;
  unitMultiplier?: number;
  barcode?: string;
}

export interface ProductFormData {
  name: string;
  sku: string;
  priceUsd: number;
  categoryId?: string;
  isWeighted: boolean;
  isTaxable: boolean;
  isSellable: boolean;
  isRawMaterial: boolean;
  productType: 'unidad' | 'pesable_kg' | 'pesable_lt' | 'raw_material';
  productionType?: 'materia_prima';
  unit: string;
  stockInicial: number;
  stockMin?: number;
  costPrice: number;
  presentations?: CreatePresentationInput[];
  stockType?: 'shared';
}

export interface AdjustStockInput {
  productId: string;
  quantity: number;
  reasonType: AdjustmentReason;
  reason?: string;
  costTotal?: number;
  costUsdPerUnit?: number;
}

export interface ActiveLot {
  id: string;
  createdAt: string;
  quantityAdded: number;
  remainingQuantity: number;
  costUsdPerUnit?: number;
  productLabel?: string;
}

export type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

export type ProductTypeFilter = 'all' | 'simple' | 'weighted' | 'with_variants' | 'raw_material';

export type TabKey = 'productos' | 'categorias' | 'historial';

export interface TabState {
  searchQuery: string;
  filterCategory: string;
  stockFilter: StockFilter;
  productTypeFilter: ProductTypeFilter;
  page: number;
}

export interface ProductFilters {
  query?: string;
  categoryId?: string;
}

export interface InventoryState {
  products: Product[];
  categories: Category[];
  lowStockProducts: Product[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  activeTab: TabKey;
  tabStates: Record<TabKey, TabState>;
}

export function kgToGrams(kg: number): number {
  return Math.round(kg * 1000);
}

export function gramsToKg(grams: number): number {
  return grams / 1000;
}

export function ltToMl(lt: number): number {
  return Math.round(lt * 1000);
}

export function mlToLt(ml: number): number {
  return ml / 1000;
}

export function displayStock(stock: number, unit: string): string {
  if (unit === 'kg') return gramsToKg(stock).toFixed(2);
  if (unit === 'lt') return mlToLt(stock).toFixed(2);
  if (unit === 'gr') return stock.toFixed(0);
  if (unit === 'm') return stock.toFixed(2);
  return stock.toString();
}

export function convertToStorage(value: number, productType: string): number {
  if (productType === 'pesable_kg') return kgToGrams(value);
  if (productType === 'pesable_lt') return ltToMl(value);
  return Math.round(value);
}
