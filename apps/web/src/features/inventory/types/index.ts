import type { z } from 'zod';
import type { ProductSchema, CategorySchema, InventoryMovementSchema, CreateProductInputSchema } from '../../../specs/inventory';

export type Product = z.infer<typeof ProductSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;
export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;

export interface ProductFormData {
  name: string;
  sku: string;
  priceUsd: number;
  categoryId?: string;
  isWeighted: boolean;
  isTaxable: boolean;
  isSellable: boolean;
  productType: 'unidad' | 'pesable_kg' | 'pesable_lt';
  unit: string;
  stockInicial: number;
  stockMin?: number;
}

export interface AdjustStockInput {
  productId: string;
  quantity: number;
  reason: string;
  costUsdPerUnit?: number;
}

export interface ActiveLot {
  id: string;
  createdAt: string;
  quantityAdded: number;
  remainingQuantity: number;
  costUsdPerUnit?: number;
}

export interface MovementRow {
  date: string;
  type: 'purchase' | 'sale' | 'adjustment' | 'initial';
  entry: number;
  exit: number;
  balance: number;
  reason?: string;
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
  activeTab: 'productos' | 'categorias' | 'historial';
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
