import { getSessionById, getOpenCashRegister, getLastClosedCashRegister, getOpenSessionByRegisterId, openCashRegister, closeCashRegister, getClosingBreakdown } from './cashRegisterService';
import { createSale, createOrder, getSalesHistory, getSaleItems, voidSale, cancelOrder } from './saleService';
import { getParkedCarts, parkCart, deleteParkedCart, toggleFavorite, getFavorites } from './cartService';
import { getProductsForSale, getTodaySoldProducts, getVerificationProducts } from './productService';
import type { CartItem } from '../types';
import type { Product } from '../../../specs/inventory';
import { convertToStorage, unitToStorageType } from '../../inventory/types';

export function needsKitchenForCart(
  cart: CartItem[],
  products: Map<string, Product>
): boolean {
  for (const item of cart) {
    const product = products.get(item.productId);
    if (!product) continue;
    if (product.hasAssemblyRecipe) return true;
    const itemQty = product.isWeighted 
      ? convertToStorage(item.quantity, unitToStorageType(product.isWeighted, product.unit)) 
      : item.quantity;
    if ((product.stock ?? 0) < itemQty) return true;
  }
  return false;
}

export const posService = {
  getSessionById,
  getOpenCashRegister,
  getLastClosedCashRegister,
  getOpenSessionByRegisterId,
  openCashRegister,
  closeCashRegister,
  getClosingBreakdown,
  createSale,
  createOrder,
  getSalesHistory,
  getSaleItems,
  voidSale,
  cancelOrder,
  getParkedCarts,
  parkCart,
  deleteParkedCart,
  toggleFavorite,
  getFavorites,
  getProductsForSale,
  getTodaySoldProducts,
  getVerificationProducts,
};
