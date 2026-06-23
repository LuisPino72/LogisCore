import { createProduct, createProductWithPresentations, updateProduct, softDeleteProduct, getProducts, getProductById, getProductBySku, uploadProductImage } from './productService';
import { getPresentationsForProduct, updatePresentation, deletePresentation, getPresentationByBarcode, getAllPresentations } from './presentationService';
import { createCategory, updateCategory, getCategories, deleteCategory } from './categoryService';
import { adjustStock, getProductLots, consumeFifo, getMovementHistory, getLowStockProducts, getAssemblyProductIds as getAssemblyProductIdsSvc } from './stockService';

export async function getAssemblyProductIds(tenantId: string): Promise<Set<string>> {
  return getAssemblyProductIdsSvc(tenantId);
}

export const inventoryService = {
  createProduct,
  createProductWithPresentations,
  updateProduct,
  softDeleteProduct,
  getProducts,
  getProductById,
  getProductBySku,
  getPresentationsForProduct,
  updatePresentation,
  deletePresentation,
  getPresentationByBarcode,
  getAllPresentations,
  createCategory,
  updateCategory,
  getCategories,
  deleteCategory,
  adjustStock,
  getProductLots,
  consumeFifo,
  getMovementHistory,
  getLowStockProducts,
  getAssemblyProductIds: getAssemblyProductIdsSvc,
  uploadProductImage,
};
