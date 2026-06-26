import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { useToastStore } from '../../../stores/toastStore';
import { useInventoryStore } from '../stores/inventoryStore';
import { getDb } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import type { Product, CreateProductInput, CreatePresentationInput, AdjustmentReason, AdjustStockInput } from '../types';

export interface ConfirmDelete {
  type: 'product' | 'category';
  id: string;
  name: string;
}

interface UseInventoryActionsOptions {
  tenantId: string | null;
  products: Product[];
  adjustStock: (input: AdjustStockInput & { userId: string; tenantId: string }) => Promise<boolean>;
  createProduct: (tenantId: string, userId: string, input: CreateProductInput & { stockInicial?: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' }) => Promise<Product | null>;
  createProductWithPresentations: (tenantId: string, userId: string, input: CreateProductInput & { stockInicial?: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' }, presentations: CreatePresentationInput[]) => Promise<Product | null>;
  updateProduct: (id: string, input: Partial<Product>, tenantId: string) => Promise<boolean>;
  deleteProduct: (id: string, tenantId: string) => Promise<boolean>;
  deleteCategory: (id: string, tenantId: string) => Promise<boolean>;
  uploadProductImage: (file: File, tenantId: string, productId: string) => Promise<string | null>;
}

export function useInventoryActions(options: UseInventoryActionsOptions) {
  const { tenantId, products, adjustStock, createProduct, createProductWithPresentations, updateProduct, deleteProduct, deleteCategory, uploadProductImage } = options;

  const session = useAuthStore((s) => s.session);
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();

  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const [selectedForOrder, setSelectedForOrder] = useState<Set<string>>(new Set());
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showBulkAdjustment, setShowBulkAdjustment] = useState(false);
  const [bulkProductIds, setBulkProductIds] = useState<string[]>([]);
  const [bulkAdjMode, setBulkAdjMode] = useState<'sumar' | 'restar'>('sumar');
  const [bulkAdjQuantity, setBulkAdjQuantity] = useState('');
  const [bulkAdjReasonType, setBulkAdjReasonType] = useState<string>('inventario_inicial');
  const [bulkAdjSubmitting, setBulkAdjSubmitting] = useState(false);
  const [bulkAdjError, setBulkAdjError] = useState('');

  const userId = session?.userId;

  const handleAdjustStock = useCallback(async (productId: string, quantity: number, reasonType: AdjustmentReason, costTotal?: number) => {
    if (!tenantId || !userId) return false;
    return adjustStock({ productId, quantity, reasonType, costTotal, userId, tenantId });
  }, [tenantId, userId, adjustStock]);

  const handleBulkAdjust = useCallback((productIds: string[]) => {
    setBulkProductIds(productIds);
    setBulkAdjMode('sumar');
    setBulkAdjQuantity('');
    setBulkAdjReasonType('inventario_inicial');
    setBulkAdjError('');
    setShowBulkAdjustment(true);
  }, []);

  const handleBulkSubmit = useCallback(async () => {
    if (!bulkAdjMode) {
      setBulkAdjError('Selecciona si quieres sumar o restar stock');
      return;
    }

    const rawQty = parseFloat(bulkAdjQuantity);
    if (isNaN(rawQty) || rawQty <= 0) {
      setBulkAdjError('Ingresa una cantidad válida mayor a 0');
      return;
    }

    if (!bulkAdjReasonType) {
      setBulkAdjError('Selecciona un motivo para el ajuste');
      return;
    }

    if (rawQty > 999999) {
      setBulkAdjError('La cantidad no puede ser mayor a 999,999');
      return;
    }

    const bulkProducts = bulkProductIds
      .map(id => products.find(p => p.id === id))
      .filter(Boolean) as Product[];

    if (bulkProducts.length === 0) {
      setBulkAdjError('No se encontraron los productos seleccionados');
      return;
    }

    for (const product of bulkProducts) {
      if (!product.isWeighted && rawQty !== Math.floor(rawQty)) {
        setBulkAdjError(`"${product.name}" es por unidad — solo acepta números enteros`);
        return;
      }
      if (product.isWeighted && !/^\d+\.?\d{0,2}$/.test(bulkAdjQuantity)) {
        setBulkAdjError(`"${product.name}" es pesable — acepta máximo 2 decimales`);
        return;
      }
    }

    if (bulkAdjMode === 'restar') {
      const exceedsProducts: string[] = [];
      for (const product of bulkProducts) {
        const maxStock = product.unit === 'kg' || product.unit === 'lt' || product.unit === 'm'
          ? (product.stock / 1000) : product.stock;
        if (rawQty > maxStock) {
          const unitLabel = product.unit === 'kg' ? 'Kg' : product.unit === 'lt' ? 'Lt' : product.unit === 'm' ? 'm' : 'unidades';
          exceedsProducts.push(`"${product.name}" (max: ${maxStock} ${unitLabel})`);
        }
      }
      if (exceedsProducts.length > 0) {
        if (exceedsProducts.length === bulkProducts.length) {
          setBulkAdjError(`Ningún producto tiene suficiente stock para restar ${rawQty}`);
        } else if (exceedsProducts.length === 1) {
          setBulkAdjError(`${exceedsProducts[0]} no tiene suficiente stock`);
        } else {
          setBulkAdjError(`${exceedsProducts.length} productos no tienen suficiente stock. Reduce la cantidad o quítalos de la selección.`);
        }
        return;
      }
    }

    setBulkAdjSubmitting(true);
    setBulkAdjError('');
    let successCount = 0;
    let failCount = 0;
    for (const product of bulkProducts) {
      const qty = bulkAdjMode === 'restar' ? -rawQty : rawQty;
      const ok = await handleAdjustStock(product.id, qty, bulkAdjReasonType as AdjustmentReason);
      if (ok) successCount++;
      else failCount++;
    }
    setBulkAdjSubmitting(false);
    if (successCount > 0) {
      const msg = failCount > 0
        ? `${successCount} ajustado${successCount !== 1 ? 's' : ''}, ${failCount} fallido${failCount !== 1 ? 's' : ''}`
        : `${successCount} producto${successCount !== 1 ? 's' : ''} ajustado${successCount !== 1 ? 's' : ''}`;
      addToast({ type: failCount > 0 ? 'warning' : 'success', message: msg, duration: 4000 });
      setShowBulkAdjustment(false);
      setBulkProductIds([]);
    } else {
      setBulkAdjError('Error al ajustar stock de todos los productos. Verifica tu conexión.');
    }
  }, [bulkAdjMode, bulkAdjQuantity, bulkAdjReasonType, bulkProductIds, products, handleAdjustStock, addToast]);

  const handleToggleProduct = useCallback((productId: string) => {
    setSelectedForOrder((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const handleRequestOrder = useCallback(() => {
    const selectedIds = Array.from(selectedForOrder);
    if (selectedIds.length === 0) return;
    setShowLowStockModal(false);
    setSelectedForOrder(new Set());
    navigate('/purchases', { state: { preSelectedProductIds: selectedIds } });
  }, [selectedForOrder, navigate]);

  const handleCreateProduct = useCallback(async (
    data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' },
    imageFile?: File | null,
    imagePreview?: string | null,
  ) => {
    if (!tenantId || !userId) return false;
    let product: Product | null = null;

    if (data.presentations && data.presentations.length > 0) {
      product = await createProductWithPresentations(tenantId, userId, data, data.presentations);
    } else {
      product = await createProduct(tenantId, userId, data);
    }

    if (product) {
      addToast({ type: 'success', message: 'Producto creado exitosamente.', duration: 3000 });
      if (imageFile) {
        const publicUrl = await uploadProductImage(imageFile, tenantId, product.id);
        if (publicUrl) {
          EventBus.emit(SystemEvents.INVENTORY_UPDATED, { productId: product.id });
        } else {
          addToast({ type: 'warning', message: 'Producto creado. La imagen no se pudo subir, pero puedes agregarla despues desde "Editar".', duration: 5000 });
        }
      } else if (imagePreview && !imagePreview.startsWith('blob:')) {
        // URL de biblioteca — usar directamente
        const db = getDb();
        await db.products.update(product.id, { imageUrl: imagePreview });
        await syncQueue.enqueue('products', 'UPDATE', product.id, { imageUrl: imagePreview }, tenantId);
        EventBus.emit(SystemEvents.INVENTORY_UPDATED, { productId: product.id });
      }
    } else {
      const storeError = useInventoryStore.getState().error;
      addToast({ type: 'error', message: storeError ?? 'Error al crear el producto. Verifica tu conexion e intenta de nuevo.', duration: 5000 });
    }
    if (product) setShowProductForm(false);
    return !!product;
  }, [tenantId, userId, createProduct, createProductWithPresentations, uploadProductImage, addToast]);

  const handleEditProduct = useCallback(async (
    data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' },
    imageFile?: File | null,
    imagePreview?: string | null,
  ) => {
    if (!editProduct || !tenantId) return false;

    if (imageFile && editProduct.imageUrl) {
      data.imageUrl = editProduct.imageUrl;
    }

    const ok = await updateProduct(editProduct.id, data, tenantId);
    if (!ok) {
      addToast({ type: 'error', message: 'Error al actualizar el producto. Verifica que los datos sean correctos y que el SKU no este duplicado.', duration: 5000 });
      return false;
    }
    addToast({ type: 'success', message: 'Producto actualizado exitosamente.', duration: 3000 });
    if (imageFile) {
      const publicUrl = await uploadProductImage(imageFile, tenantId, editProduct.id);
      if (publicUrl) {
        setEditProduct(prev => prev ? { ...prev, imageUrl: publicUrl } : null);
        EventBus.emit(SystemEvents.INVENTORY_UPDATED, { productId: editProduct.id });
      } else {
        addToast({ type: 'warning', message: 'Producto actualizado. La imagen no se pudo subir, pero puedes agregarla despues desde "Editar".', duration: 5000 });
      }
    } else if (imagePreview && !imagePreview.startsWith('blob:') && imagePreview !== editProduct.imageUrl) {
      // URL de biblioteca — usar directamente
      const db = getDb();
      await db.products.update(editProduct.id, { imageUrl: imagePreview });
      await syncQueue.enqueue('products', 'UPDATE', editProduct.id, { imageUrl: imagePreview }, tenantId);
      setEditProduct(prev => prev ? { ...prev, imageUrl: imagePreview } : null);
      EventBus.emit(SystemEvents.INVENTORY_UPDATED, { productId: editProduct.id });
    }
    setEditProduct(null);
    setShowProductForm(false);
    return true;
  }, [editProduct, tenantId, updateProduct, uploadProductImage, addToast]);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete || !tenantId) return;
    if (confirmDelete.type === 'product') {
      const ok = await deleteProduct(confirmDelete.id, tenantId);
      addToast({ type: ok ? 'success' : 'error', message: ok ? 'Producto eliminado.' : 'No se pudo eliminar el producto. Verifica que el stock esté en 0 y no tenga órdenes de compra activas.', duration: 5000 });
    } else {
      const ok = await deleteCategory(confirmDelete.id, tenantId);
      addToast({ type: ok ? 'success' : 'error', message: ok ? 'Categoría eliminada.' : 'No se pudo eliminar la categoría. Verifica que no tenga productos asociados.', duration: 5000 });
    }
    setConfirmDelete(null);
  }, [confirmDelete, tenantId, deleteProduct, deleteCategory, addToast]);

  const openNewProduct = useCallback(() => {
    setEditProduct(null);
    setShowProductForm(true);
  }, []);

  const openEditProduct = useCallback((product: Product) => {
    setEditProduct(product);
    setShowProductForm(true);
  }, []);

  const openNewCategory = useCallback(() => setShowCategoryForm(true), []);

  return {
    handleAdjustStock,
    handleBulkAdjust,
    handleBulkSubmit,
    handleToggleProduct,
    handleRequestOrder,
    handleCreateProduct,
    handleEditProduct,
    handleConfirmDelete,
    openNewProduct,
    openEditProduct,
    openNewCategory,
    showProductForm,
    setShowProductForm,
    editProduct,
    setEditProduct,
    confirmDelete,
    setConfirmDelete,
    selectedForOrder,
    setSelectedForOrder,
    showLowStockModal,
    setShowLowStockModal,
    showCategoryForm,
    setShowCategoryForm,
    showBulkAdjustment,
    setShowBulkAdjustment,
    bulkProductIds,
    setBulkProductIds,
    bulkAdjMode,
    setBulkAdjMode,
    bulkAdjQuantity,
    setBulkAdjQuantity,
    bulkAdjReasonType,
    setBulkAdjReasonType,
    bulkAdjSubmitting,
    setBulkAdjSubmitting,
    bulkAdjError,
    setBulkAdjError,
  };
}
