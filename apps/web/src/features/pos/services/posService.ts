import { getSessionById, getOpenCashRegister, getLastClosedCashRegister, openCashRegister, closeCashRegister } from './cashRegisterService';
import { createSale, getSalesHistory, getSaleItems, voidSale } from './saleService';
import { getParkedCarts, parkCart, deleteParkedCart, toggleFavorite, getFavorites } from './cartService';
import { getProductsForSale, getTodaySoldProducts, getVerificationProducts } from './productService';

export const posService = {
  getSessionById,
  getOpenCashRegister,
  getLastClosedCashRegister,
  openCashRegister,
  closeCashRegister,
  createSale,
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
