import { getSessionById, getOpenCashRegister, getLastClosedCashRegister, getOpenSessionByRegisterId, openCashRegister, closeCashRegister } from './cashRegisterService';
import { createSale, createOrder, getSalesHistory, getSaleItems, voidSale } from './saleService';
import { getParkedCarts, parkCart, deleteParkedCart, toggleFavorite, getFavorites } from './cartService';
import { getProductsForSale, getTodaySoldProducts, getVerificationProducts } from './productService';
import type { CartItem } from '../types';
import type { Product } from '../../../specs/inventory';

export function needsKitchenForCart(
  cart: CartItem[],
  products: Map<string, Product>
): boolean {
  for (const item of cart) {
    const product = products.get(item.productId);
    if (!product) continue;
    if (product.hasAssemblyRecipe) return true;
    const itemQty = product.isWeighted ? item.quantity * 1000 : item.quantity;
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
  createSale,
  createOrder,
  getSalesHistory,
  getSaleItems,
  voidSale,
  getParkedCarts,
  parkCart,
  deleteParkedCart,
  toggleFavorite,
  getFavorites,
  getProductsForSale,
  getTodaySoldProducts,
  getVerificationProducts,
};
