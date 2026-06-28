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
  productType: 'unidad' | 'pesable_kg' | 'pesable_lt' | 'pesable_m' | 'raw_material';
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

export function mToMm(m: number): number {
  return Math.round(m * 1000);
}

export function mmToM(mm: number): number {
  return mm / 1000;
}

export function displayStock(stock: number, unit: string): string {
  if (unit === 'kg') return gramsToKg(stock).toFixed(2).replace(/\.00$/, '');
  if (unit === 'lt') return mlToLt(stock).toFixed(2).replace(/\.00$/, '');
  if (unit === 'gr') return stock.toFixed(0);
  if (unit === 'm') return mmToM(stock).toFixed(2).replace(/\.00$/, '');
  return stock.toString();
}

/**
 * Formatea cantidad de storage (g/ml) para producción:
 * - < 1000 g → muestra en gramos (ej: "500 g")
 * - >= 1000 g → muestra en kg (ej: "1.5 kg")
 * - Mismo patrón para ml/lt
 */
export function displayProductionQty(storageQty: number, unit: string): string {
  const absQty = Math.abs(storageQty);
  if (unit === 'kg') {
    if (absQty < 1000) return `${absQty} g`;
    return `${gramsToKg(absQty).toFixed(2).replace(/\.00$/, '')} kg`;
  }
  if (unit === 'lt') {
    if (absQty < 1000) return `${absQty} ml`;
    return `${mlToLt(absQty).toFixed(2).replace(/\.00$/, '')} lt`;
  }
  if (unit === 'gr') return `${absQty} g`;
  if (unit === 'm') return `${mmToM(absQty).toFixed(2).replace(/\.00$/, '')} m`;
  return absQty.toString();
}

export function convertToStorage(value: number, productType: string): number {
  if (productType === 'pesable_kg') return kgToGrams(value);
  if (productType === 'pesable_lt') return ltToMl(value);
  if (productType === 'pesable_m') return mToMm(value);
  return Math.round(value);
}

/**
 * Mapea unit + isWeighted al productType correcto para almacenamiento.
 * Reemplaza ternarios hardcodeados como: unit === 'lt' ? 'pesable_lt' : 'pesable_kg'
 */
export function unitToStorageType(isWeighted: boolean, unit: string): string {
  if (!isWeighted) return 'unidad';
  if (unit === 'kg') return 'pesable_kg';
  if (unit === 'lt') return 'pesable_lt';
  if (unit === 'm') return 'pesable_m';
  return 'pesable_kg';
}
