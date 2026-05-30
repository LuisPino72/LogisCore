import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventBus } from '@logiscore/core';
import { Package, ListTree, History, AlertTriangle, Plus, Minus, Settings, ShoppingCart, Circle, CheckCircle2, Upload } from 'lucide-react';
import { Button, Card, EmptyState, Modal, Input, BottomNav, ModuleOnboarding, Tooltip, SearchableSelect } from '../../../common/components';
import { useInventory } from '../hooks/useInventory';
import { useInventoryStore } from '../stores/inventoryStore';
import { useStockAlerts } from '../hooks/useStockAlerts';
import { useToastStore } from '../../../stores/toastStore';
import { inventoryService } from '../services/inventoryService';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { ProductList } from './ProductList';
import { ProductForm } from './ProductForm';
import { ProductLots } from './ProductLots';
import { CategoryManager } from './CategoryManager';
import { MovementHistory } from './MovementHistory';
import { LowStockBadge } from './LowStockBadge';
import { CSVUploadModal } from './CSVUploadModal';
import type { CreateProductInput, CreatePresentationInput, Product, AdjustmentReason } from '../types';



interface ConfirmDelete {
  type: 'product' | 'category';
  id: string;
  name: string;
}

interface InventoryPageProps {
  tenantId: string | null;
}

export function InventoryPage({ tenantId }: InventoryPageProps) {
  const {
    products, categories, loading, activeTab, setActiveTab,
    createProduct, updateProduct, deleteProduct, createCategory, updateCategory, deleteCategory, adjustStock, createProductWithPresentations,
    updateProductImageUrl,
    search, refresh, userId, role, tabStates, saveTabState,
  } = useInventory(tenantId);

  const { totalLowStock, lowStockProducts } = useStockAlerts(tenantId);
  const { addToast } = useToastStore();
  const isOnline = useOnlineStatus();
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjProductId, setAdjProductId] = useState<string>('');
  const [adjMode, setAdjMode] = useState<'sumar' | 'restar' | ''>('');
  const [adjQuantity, setAdjQuantity] = useState('');
  const [adjReasonType, setAdjReasonType] = useState<string>('');
  const [adjCostTotal, setAdjCostTotal] = useState('');
  const [adjShowCostInput, setAdjShowCostInput] = useState(false);
  const [adjHasCost, setAdjHasCost] = useState(true);
  const [adjError, setAdjError] = useState('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const [selectedProductLotsId, setSelectedProductLotsId] = useState<string | null>(null);
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [selectedForOrder, setSelectedForOrder] = useState<Set<string>>(new Set());
  const [showCsvImport, setShowCsvImport] = useState(false);
  

  const navigate = useNavigate();

  const handleToggleProduct = (productId: string) => {
    setSelectedForOrder((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleRequestOrder = () => {
    const selectedIds = Array.from(selectedForOrder);
    if (selectedIds.length === 0) return;
    setShowLowStockModal(false);
    setSelectedForOrder(new Set());
    navigate('/purchases', { state: { preSelectedProductIds: selectedIds } });
  };

  const isOwner = role === 'owner' || role === 'admin';

  const [showCategoryForm, setShowCategoryForm] = useState(false);

  const openNewCategory = () => setShowCategoryForm(true);

  const handleCreateProduct = async (data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' }, imageFile?: File | null) => {
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
        const imgResult = await inventoryService.uploadProductImage(imageFile, tenantId, product.id);
        if (imgResult.ok) {
          updateProductImageUrl(product.id, imgResult.data);
          EventBus.emit('INVENTORY.UPDATED', { productId: product.id });
        } else {
          addToast({ type: 'warning', message: `Producto creado, pero la imagen no se pudo subir: ${imgResult.error?.message}`, duration: 5000 });
        }
      }
    } else {
      const storeError = useInventoryStore.getState().error;
      addToast({ type: 'error', message: storeError ?? 'Error al crear el producto. Verifica tu conexión e intenta de nuevo.', duration: 5000 });
    }
    if (product) setShowProductForm(false);
    return !!product;
  };

  const handleEditProduct = async (data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' }, imageFile?: File | null) => {
    if (!editProduct || !tenantId) return false;
    const ok = await updateProduct(editProduct.id, data, tenantId);
    if (!ok) {
      addToast({ type: 'error', message: 'Error al actualizar el producto. Verifica que los datos sean correctos y que el SKU no esté duplicado.', duration: 5000 });
      return false;
    }
    addToast({ type: 'success', message: 'Producto actualizado exitosamente.', duration: 3000 });
    if (imageFile) {
      const imgResult = await inventoryService.uploadProductImage(imageFile, tenantId, editProduct.id);
      if (imgResult.ok) {
        updateProductImageUrl(editProduct.id, imgResult.data);
        EventBus.emit('INVENTORY.UPDATED', { productId: editProduct.id });
      } else {
        addToast({ type: 'warning', message: `Producto actualizado, pero la imagen no se pudo subir: ${imgResult.error?.message}`, duration: 5000 });
      }
    }
    setEditProduct(null);
    setShowProductForm(false);
    return true;
  };

  const handleAdjustStock = async (productId: string, quantity: number, reasonType: AdjustmentReason, costTotal?: number) => {
    if (!tenantId || !userId) return false;
    return adjustStock({ productId, quantity, reasonType, costTotal, userId, tenantId });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete || !tenantId) return;
    if (confirmDelete.type === 'product') {
      const ok = await deleteProduct(confirmDelete.id, tenantId);
      addToast({ type: ok ? 'success' : 'error', message: ok ? 'Producto eliminado.' : 'No se pudo eliminar el producto. Verifica que el stock esté en 0 y no tenga órdenes de compra activas.', duration: 5000 });
    } else {
      const ok = await deleteCategory(confirmDelete.id, tenantId);
      addToast({ type: ok ? 'success' : 'error', message: ok ? 'Categoría eliminada.' : 'No se pudo eliminar la categoría. Verifica que no tenga productos asociados.', duration: 5000 });
    }
    setConfirmDelete(null);
  };

  const openNewProduct = () => {
    setEditProduct(null);
    setShowProductForm(true);
  };

  const openEditProduct = (product: Product) => {
    setEditProduct(product);
    setShowProductForm(true);
  };

  const handleSubmitAdjustment = async () => {
    if (!adjMode) { setAdjError('Selecciona si quieres sumar o restar stock'); return; }
    const rawQty = parseFloat(adjQuantity);
    if (isNaN(rawQty) || rawQty <= 0) { setAdjError('Ingresa una cantidad válida mayor a 0'); return; }
    if (!adjReasonType) { setAdjError('Selecciona un motivo para el ajuste'); return; }

    const product = products.find((p) => p.id === adjProductId);
    if (product && !product.isWeighted && rawQty !== Math.floor(rawQty)) {
      setAdjError('Los productos por unidad solo aceptan números enteros');
      return;
    }
    if (product?.isWeighted && adjQuantity && !/^\d+\.?\d{0,2}$/.test(adjQuantity)) {
      setAdjError('Los productos pesables aceptan máximo 2 decimales');
      return;
    }

    if (adjMode === 'restar') {
      if (product) {
        const maxStock = product.unit === 'kg' || product.unit === 'lt'
          ? (product.stock / 1000) : product.stock;
        if (rawQty > maxStock) {
          const unitLabel = product.unit === 'kg' ? 'Kg' : product.unit === 'lt' ? 'Lt' : 'unidades';
          setAdjError(`No puedes restar más de ${maxStock} ${unitLabel} (stock actual)`);
          return;
        }
      }
    }

    const qty = adjMode === 'restar' ? -rawQty : rawQty;

    setAdjSubmitting(true);
    setAdjError('');
    const ok = await handleAdjustStock(
      adjProductId,
      qty,
      adjReasonType as AdjustmentReason,
      adjShowCostInput && adjCostTotal ? parseFloat(adjCostTotal) : undefined,
    );
    setAdjSubmitting(false);

    if (ok) {
      addToast({ type: 'success', message: 'Stock ajustado correctamente', duration: 3000 });
      setAdjQuantity('');
      setAdjReasonType('');
      setAdjCostTotal('');
      setAdjShowCostInput(false);
      setAdjHasCost(true);
      setAdjMode('');
      setAdjProductId('');
      setShowAdjustment(false);
    } else {
      setAdjError('Error al ajustar stock. Verifica el stock disponible.');
    }
  };

  const checkProductCost = async (productId: string) => {
    const result = await inventoryService.getProductLots(productId);
    if (result.ok) {
      setAdjHasCost(result.data.some((l) => (l.costUsdPerUnit ?? 0) > 0));
    }
  };

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!loading && !hasLoadedOnce) setHasLoadedOnce(true);
  }, [loading, hasLoadedOnce]);

  if (!tenantId) {
    return <EmptyState icon={<Package size={48} />} title="Selecciona un tenant" description="No hay tenant activo" />;
  }

  if (!hasLoadedOnce) {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-title font-bold" style={{ fontSize: 'var(--text-fluid-xl)' }}>Inventario</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-secondary mb-3">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Cargando productos...
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            {activeTab === 'categorias' ? <ListTree size={18} className="text-primary" /> : <Package size={18} className="text-primary" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-title font-bold truncate" style={{ fontSize: 'var(--text-fluid-xl)' }}>
              {activeTab === 'categorias' ? 'Categorías' : activeTab === 'historial' ? 'Historial' : 'Inventario'}
            </h1>
            <p className="text-[13px] text-text-secondary hidden sm:block truncate max-w-md">
              {activeTab === 'categorias' ? 'Organiza tus productos por categorías para encontrarlos más rápido al vender.' : activeTab === 'historial' ? 'Revisa todos los movimientos de tus productos: ventas, compras, ajustes y más.' : 'Administra tu inventario: crea, edita y organiza tus productos.'}
            </p>
            {totalLowStock > 0 && activeTab === 'productos' && (
              <div className="mt-0.5">
                <LowStockBadge count={totalLowStock} onClick={() => setShowLowStockModal(true)} />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOwner && activeTab === 'productos' && (
            <Button variant="outline" size="sm" onClick={() => setShowCsvImport(true)} disabled={!isOnline} title={!isOnline ? 'Necesitas internet para importar' : undefined}>
              <Upload size={16} />
              <span className="hidden sm:inline">Importar CSV</span>
            </Button>
          )}
          {isOwner && activeTab !== 'historial' && (
            <Button variant="primary" size="sm" onClick={activeTab === 'categorias' ? openNewCategory : openNewProduct} disabled={!isOnline} title={!isOnline ? 'Necesitas internet para esta acción' : undefined}>
              <Plus size={16} />
              <span className="hidden sm:inline">{activeTab === 'categorias' ? 'Nueva categoría' : 'Nuevo producto'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Desktop tabs */}
      <div className="hidden sm:flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/60 p-1 sticky top-0 z-10 shadow-sm">
        <Tooltip content="Gestiona productos y stock" position="bottom">
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'productos'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('productos')}
          >
            <Package size={18} />
            Productos
          </button>
        </Tooltip>
        <Tooltip content="Organiza productos por categorías" position="bottom">
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'categorias'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('categorias')}
          >
            <ListTree size={18} />
            Categorías
          </button>
        </Tooltip>
        <Tooltip content="Movimientos y ajustes de stock" position="bottom">
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'historial'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('historial')}
          >
            <History size={18} />
            Historial
          </button>
        </Tooltip>
      </div>

      <Card>
        {activeTab === 'productos' && (
          <div key="productos" className="animate-fade-in">
            <ProductList
              products={products}
              categories={categories}
              tenantId={tenantId || ''}
              onSearch={search}
              initialTabState={tabStates.productos}
              onSaveTabState={(state) => saveTabState('productos', state)}
              isOwner={isOwner}
              isOnline={isOnline}
              totalLowStock={totalLowStock}
              onNewProduct={openNewProduct}
              onEditProduct={openEditProduct}
              onRequestDelete={(id, name) => setConfirmDelete({ type: 'product', id, name })}
              onAdjust={async (id) => {
                setAdjProductId(id);
                setAdjMode('');
                setAdjReasonType('');
                setAdjQuantity('');
                await checkProductCost(id);
                setShowAdjustment(true);
              }}
              onViewLots={(id) => setSelectedProductLotsId(id)}
              onRefresh={refresh}
            />
          </div>
        )}

        {activeTab === 'categorias' && (
          <div key="categorias" className="animate-fade-in">
            <div className="p-4">
              <CategoryManager
                categories={categories}
                isOwner={isOwner}
                onCreate={async (name) => {
                  if (!tenantId) return false;
                  const newId = await createCategory(name, tenantId);
                  if (newId) addToast({ type: 'success', message: 'Categoría creada exitosamente.', duration: 3000 });
                  return !!newId;
                }}
                onUpdate={async (id, name) => {
                  if (!tenantId) return false;
                  const ok = await updateCategory(id, name, tenantId);
                  if (ok) addToast({ type: 'success', message: 'Categoría actualizada exitosamente.', duration: 3000 });
                  return ok;
                }}
                onRequestDelete={(id, name) => setConfirmDelete({ type: 'category', id, name })}
                isOpen={showCategoryForm}
                onClose={() => setShowCategoryForm(false)}
              />
            </div>
          </div>
        )}

        {activeTab === 'historial' && (
          <div key="historial" className="animate-fade-in">
            <div className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <History size={16} className="text-primary" />
                </div>
                <h2 className="text-sm font-title font-bold text-gray-900">Historial de movimientos</h2>
              </div>
              {!isOwner ? (
                <p className="text-sm text-text-secondary text-center py-4">Solo el propietario puede ver el historial.</p>
              ) : (
                <MovementHistory products={products} />
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeId={activeTab}
        items={[
          { id: 'productos', label: 'Productos', icon: <Package size={20} />, onClick: () => setActiveTab('productos') },
          { id: 'categorias', label: 'Categorías', icon: <ListTree size={20} />, onClick: () => setActiveTab('categorias') },
          { id: 'historial', label: 'Historial', icon: <History size={20} />, onClick: () => setActiveTab('historial') },
        ]}
      />

      {showProductForm && (
        <ProductForm
          isOpen={showProductForm}
          onClose={() => { setShowProductForm(false); setEditProduct(null); }}
          onSubmit={editProduct ? handleEditProduct : handleCreateProduct}
          categories={categories}
          editProduct={editProduct}
          onCreateCategory={async (name: string) => {
            if (!tenantId) return null;
            const newId = await createCategory(name, tenantId);
            if (newId) refresh();
            return newId;
          }}
        />
      )}

      {showAdjustment && (() => {
        const product = products.find((p) => p.id === adjProductId);
        const displayStockValue = product ? (() => {
          if (product.unit === 'kg') return (product.stock / 1000).toFixed(2);
          if (product.unit === 'lt') return (product.stock / 1000).toFixed(2);
          return product.stock.toString();
        })() : '';
        const unitLabel = product?.unit === 'kg' ? 'Kg' : product?.unit === 'lt' ? 'Lt' : '';

        const REASON_OPTIONS: { value: AdjustmentReason; label: string }[] = [
          { value: 'inventario_inicial', label: 'Error de ingreso inicial' },
          { value: 'perdida', label: 'Pérdida' },
          { value: 'robo', label: 'Robo' },
          { value: 'vencido', label: 'Vencido' },
          { value: 'consumo_interno', label: 'Consumo interno' },
          { value: 'otros', label: 'Otros' },
        ];

        const closeAdjustment = () => {
          setShowAdjustment(false);
          setAdjProductId('');
          setAdjHasCost(true);
          setAdjMode('');
        };

        return (
          <Modal
            isOpen={showAdjustment}
            onClose={closeAdjustment}
            title="Ajuste de stock"
            footer={
              <div className="flex gap-3 w-full">
                <Button variant="ghost" fullWidth onClick={closeAdjustment}>Cancelar</Button>
                <Button variant="primary" fullWidth onClick={handleSubmitAdjustment} disabled={adjSubmitting || !isOnline}>{adjSubmitting ? 'Ajustando...' : 'Ajustar stock'}</Button>
              </div>
            }
          >
            <div className="space-y-4">
              {product && (
                <div className="bg-linear-to-br from-primary/4 to-primary/2 border border-primary/10 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Package size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {product.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                          Stock: {displayStockValue} {unitLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="input-label">Tipo de ajuste</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjMode(adjMode === 'sumar' ? '' : 'sumar');
                      setAdjQuantity('');
                      setAdjError('');
                      setAdjReasonType(adjMode === 'sumar' ? '' : 'inventario_inicial');
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                      adjMode === 'sumar'
                        ? 'bg-success text-white shadow-sm'
                        : 'bg-gray-50 text-text-secondary hover:bg-gray-100 border border-border'
                    }`}
                  >
                    <Plus size={16} />
                    Sumar stock
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjMode(adjMode === 'restar' ? '' : 'restar');
                      setAdjQuantity('');
                      setAdjError('');
                      setAdjReasonType(adjMode === 'restar' ? '' : 'perdida');
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                      adjMode === 'restar'
                        ? 'bg-danger text-white shadow-sm'
                        : 'bg-gray-50 text-text-secondary hover:bg-gray-100 border border-border'
                    }`}
                  >
                    <Minus size={16} />
                    Restar stock
                  </button>
                </div>
              </div>

              {adjMode && (
                <div className="input-wrapper">
                  <label className="input-label">Cantidad {adjMode === 'sumar' ? 'a sumar' : 'a restar'}</label>
                  <Input
                    sanitize="number"
                    decimals={product?.isWeighted ? 2 : 0}
                    inputMode={product?.isWeighted ? "decimal" : "numeric"}
                    placeholder={product?.isWeighted ? "Ej: 10.5" : "Ej: 10"}
                    value={adjQuantity}
                    onChange={(e) => setAdjQuantity(e.target.value)}
                    validation={{ required: true, min: 0.01 }}
                    error={adjError}
                    inputClassName="text-sm"
                  />
                </div>
              )}

              {adjMode && (
                <div className="input-wrapper">
                  <label className="input-label">Motivo</label>
                  <SearchableSelect
                    value={adjReasonType}
                    onChange={(v) => setAdjReasonType(v)}
                    options={REASON_OPTIONS.filter((o) =>
                      adjMode === 'sumar'
                        ? o.value === 'inventario_inicial'
                        : o.value !== 'inventario_inicial'
                    )}
                    hideSearch
                  />
                </div>
              )}

              {!adjHasCost && (
                <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-warning-dark font-medium">
                    ⚠️ Este producto no tiene costo registrado. Los ajustes se registrarán con costo <strong>$0 por unidad</strong>.
                  </p>
                  {!adjShowCostInput && (
                    <Button variant="outline" size="sm" onClick={() => setAdjShowCostInput(true)}>
                      Agregar costo total ($)
                    </Button>
                  )}
                </div>
              )}

              {adjShowCostInput && (
                <div className="input-wrapper">
                  <label className="input-label">Costo total del ajuste ($)</label>
                  <Input
                    sanitize="currency"
                    step="0.01"
                    placeholder="0.00"
                    value={adjCostTotal}
                    onChange={(e) => setAdjCostTotal(e.target.value)}
                    validation={{ min: 0, max: 999999 }}
                    inputClassName="text-sm"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Costo total de las unidades que entran (para ajustes positivos).
                  </p>
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {confirmDelete && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmDelete(null)}
          title="Confirmar eliminación"
          footer={
            <div className="flex gap-3 w-full">
              <Button variant="ghost" fullWidth onClick={() => setConfirmDelete(null)}>
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={handleConfirmDelete} disabled={!isOnline}>
                Eliminar
              </Button>
            </div>
          }
        >
          <div className="space-y-4 animate-slide-down">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center shrink-0 ring-1 ring-danger/20">
                <AlertTriangle size={24} className="text-danger" />
              </div>
              <div className="pt-1">
                <p className="text-sm font-semibold text-gray-900">¿Eliminar {confirmDelete.name}?</p>
                <p className="text-xs text-gray-500 mt-1">
                  {confirmDelete.type === 'product'
                    ? 'El producto se borrará definitivamente. Esta acción no se puede deshacer.'
                    : 'La categoría se borrará definitivamente. Esta acción no se puede deshacer.'}
                </p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {selectedProductLotsId && tenantId && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedProductLotsId(null)}
          title="Lotes del producto"
        >
          <ProductLots
            productId={selectedProductLotsId}
            tenantId={tenantId}
            unit={products.find((p) => p.id === selectedProductLotsId)?.unit}
          />
        </Modal>
      )}

      {showLowStockModal && (
        <Modal
          isOpen={showLowStockModal}
          onClose={() => { setShowLowStockModal(false); setSelectedForOrder(new Set()); }}
          title="Productos con stock bajo"
          footer={
            <Button
              variant="primary"
              fullWidth
              onClick={handleRequestOrder}
              disabled={selectedForOrder.size === 0 || !isOnline}
            >
              <ShoppingCart size={16} />
              Pedir seleccionados ({selectedForOrder.size})
            </Button>
          }
        >
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {lowStockProducts.map((product) => {
              const displayStock_val = product.unit === 'kg' || product.unit === 'lt'
                ? (product.stock / 1000).toFixed(2)
                : product.stock.toString();
              const displayMin = product.unit === 'kg' || product.unit === 'lt'
                ? ((product.stockMin ?? 0) / 1000).toFixed(2)
                : (product.stockMin ?? 0).toString();
              const unitLabel = product.unit === 'kg' ? 'Kg' : product.unit === 'lt' ? 'Lt' : '';
              const isSelected = selectedForOrder.has(product.id);
              const isZero = product.stock <= 0;

              return (
                <div
                  key={product.id}
                  onClick={() => handleToggleProduct(product.id)}
                  className={`rounded-lg p-3 border cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'border-primary ring-1 ring-primary/30 bg-primary/2'
                      : 'border-border hover:border-primary/30 hover:bg-gray-50/50'
                  } ${isZero ? 'border-l-3 border-l-danger' : 'border-l-3 border-l-warning'}`}
                  style={!isSelected && !isZero ? { borderLeftColor: 'var(--color-warning)' } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">
                      {isSelected ? (
                        <CheckCircle2 size={20} className="text-primary" />
                      ) : (
                        <Circle size={20} className="text-gray-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 wrap-break-word">{product.name}</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Stock: <span className={`font-medium ${isZero ? 'text-danger' : ''}`}>{displayStock_val} {unitLabel}</span>
                        {' / '}Mín: {displayMin} {unitLabel}
                      </p>
                    </div>
                    <div className={`p-1.5 rounded-lg shrink-0 ${isZero ? 'bg-danger/10' : 'bg-warning/10'}`}>
                      <AlertTriangle size={16} className={isZero ? 'text-danger' : 'text-warning'} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      

      <ModuleOnboarding
        moduleId="inventory"
        steps={[
          {
            title: 'Gestiona tu Inventario',
            description: 'Aquí agregas, editas y controlas todos tus productos. Cada producto tiene nombre, código SKU, precio y stock.',
            icon: <Package size={24} className="text-white" />,
          },
          {
            title: 'Categorías',
            description: 'Organiza tus productos en categorías para encontrarlos más rápido al vender. Puedes crear, editar y eliminar categorías.',
            icon: <ListTree size={24} className="text-white" />,
          },
          {
            title: 'Ajustes de Stock',
            description: 'Usa "Ajustar stock" para corregir cantidades cuando haya diferencias. Siempre indica el motivo: merma, rotura, stock inicial, etc.',
            icon: <Settings size={24} className="text-white" />,
          },
          {
            title: 'Historial de Movimientos',
            description: 'Aquí ves todos los cambios de stock: ventas, ajustes, recepciones de compras. Solo el propietario puede ver el historial.',
            icon: <History size={24} className="text-white" />,
          },
        ]}
        onComplete={() => {}}
      />
      <CSVUploadModal
        isOpen={showCsvImport}
        onClose={() => setShowCsvImport(false)}
        tenantId={tenantId ?? ''}
        userId={userId ?? ''}
        onImported={() => refresh()}
        onEditErrors={() => {
          setShowCsvImport(false);
          openNewProduct();
        }}
      />
    </div>
  );
}
