import { useState, useEffect } from 'react';

import { Package, ListTree, History, AlertTriangle, Plus, Minus, Settings, ShoppingCart, Circle, CheckCircle2, Upload } from 'lucide-react';
import { Button, Card, EmptyState, Modal, Input, BottomNav, ModuleOnboarding, Tooltip, SearchableSelect } from '../../../common/components';
import { useInventory } from '../hooks/useInventory';

import { useStockAlerts } from '../hooks/useStockAlerts';
import { useToastStore } from '../../../stores/toastStore';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { getDb } from '../../../services/dexie/db';
import { ProductList } from './ProductList';
import { ProductForm } from './ProductForm';
import { ProductLots } from './ProductLots';
import { CategoryManager } from './CategoryManager';
import { MovementHistory } from './MovementHistory';
import { LowStockBadge } from './LowStockBadge';
import { CSVUploadModal } from './CSVUploadModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { BulkPriceUpdateModal } from './BulkPriceUpdateModal';
import { useStockAdjustment } from '../hooks/useStockAdjustment';
import { useBulkPriceUpdate } from '../hooks/useBulkPriceUpdate';
import { useInventoryActions } from '../hooks/useInventoryActions';

import type { AdjustmentReason, Product } from '../types';
import { displayQty } from '../types';

interface InventoryPageProps {
  tenantId: string | null;
}

export function InventoryPage({ tenantId }: InventoryPageProps) {
  const {
    products, categories, loading, activeTab, setActiveTab,
    createProduct, updateProduct, deleteProduct, createCategory, updateCategory, deleteCategory, adjustStock, createProductWithPresentations,
    uploadProductImage,
    search, refresh, userId, role, tabStates, saveTabState,
  } = useInventory(tenantId);

  const { totalLowStock, lowStockProducts } = useStockAlerts(tenantId);
  const { addToast } = useToastStore();
  const isOnline = useOnlineStatus();
  const [selectedProductLotsId, setSelectedProductLotsId] = useState<string | null>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);

  const {
    handleAdjustStock, handleBulkAdjust, handleBulkSubmit, handleToggleProduct,
    handleRequestOrder, handleCreateProduct, handleEditProduct, handleConfirmDelete,
    openNewProduct, openEditProduct, openNewCategory,
    showProductForm, setShowProductForm, editProduct, setEditProduct,
    confirmDelete, setConfirmDelete, selectedForOrder, setSelectedForOrder,
    showLowStockModal, setShowLowStockModal,
    showCategoryForm, setShowCategoryForm,
    showBulkAdjustment, setShowBulkAdjustment,
    bulkProductIds, setBulkProductIds,
    bulkAdjMode, setBulkAdjMode,
    bulkAdjQuantity, setBulkAdjQuantity,
    bulkAdjReasonType, setBulkAdjReasonType,
    bulkAdjSubmitting, bulkAdjError, setBulkAdjError,
  } = useInventoryActions({
    tenantId,
    products,
    adjustStock,
    createProduct,
    createProductWithPresentations,
    updateProduct,
    deleteProduct,
    deleteCategory,
    uploadProductImage,
  });

  const {
    showAdjustment, adjProductId, adjMode, adjQuantity, adjReasonType,
    adjCostTotal, adjShowCostInput, adjHasCost, adjError, adjSubmitting,
    openAdjustment, closeAdjustment, setAdjMode, setAdjQuantity, setAdjReasonType,
    setAdjCostTotal, setAdjShowCostInput, setAdjError, handleSubmitAdjustment, checkProductCost,
  } = useStockAdjustment({
    products,
    onAdjustStock: handleAdjustStock,
    onSuccess: () => addToast({ type: 'success', message: 'Stock ajustado correctamente', duration: 3000 }),
  });

  const bulkPrice = useBulkPriceUpdate({
    products,
    tenantId: tenantId || '',
    onSuccess: () => refresh(),
  });

  const isOwner = role === 'owner' || role === 'admin';

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [producedProductIds, setProducedProductIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!loading && !hasLoadedOnce) setHasLoadedOnce(true);
  }, [loading, hasLoadedOnce]);

  // Load recipe product IDs to identify produced products
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const db = getDb();
        const recipes = await db.recipes
          .where({ tenantId })
          .filter((r) => !r.deletedAt && r.isActive)
          .toArray();
        if (!cancelled) {
          setProducedProductIds(new Set(recipes.map((r) => r.productId)));
        }
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);
  if (!tenantId) {
    return <EmptyState icon={<Package size={48} />} title="Selecciona tu negocio" description="No hay un negocio activo" />;
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
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="skeleton w-16 h-16 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                  <div className="flex gap-2 mt-1">
                    <div className="skeleton h-5 w-16 rounded-full" />
                    <div className="skeleton h-5 w-12 rounded-full" />
                  </div>
                </div>
                <div className="skeleton w-8 h-8 rounded-full shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 pb-24 sm:pb-6 max-w-6xl mx-auto space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="bg-linear-to-r from-primary/3 via-transparent to-transparent rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              {activeTab === 'categorias' ? <ListTree size={18} className="text-primary" /> : <Package size={18} className="text-primary" />}
            </div>
            <div className="min-w-0">
              <h1 className="text-[clamp(1.25rem,1rem+1.5vw,1.75rem)] font-title font-bold wrap-break-word">
                {activeTab === 'categorias' ? 'Categorías' : activeTab === 'historial' ? 'Historial' : 'Inventario'}
              </h1>
              <p className="text-[13px] text-text-secondary hidden sm:block truncate max-w-md">
                {activeTab === 'categorias' ? 'Organiza tus productos por categorías para encontrarlos más rápido al vender.' : activeTab === 'historial' ? 'Revisa todos los movimientos de tus productos: ventas, compras, ajustes y más.' : 'Administra tu inventario: crea, edita y organiza tus productos.'}
              </p>
              {totalLowStock > 0 && activeTab === 'productos' && (
                <div className="mt-0.5">
                  <Tooltip content="Ver productos con stock bajo" variant="help">
                    <LowStockBadge count={totalLowStock} onClick={() => setShowLowStockModal(true)} />
                  </Tooltip>
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
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary/10 text-primary">{products.length}</span>
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
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary/10 text-primary">{categories.length}</span>
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
                await checkProductCost(id);
                openAdjustment(id);
              }}
              onViewLots={(id) => setSelectedProductLotsId(id)}
              onRefresh={refresh}
              onBulkAdjust={handleBulkAdjust}
              onBulkPriceUpdate={bulkPrice.openModal}
            />
          </div>
        )}

        {activeTab === 'categorias' && (
          <div key="categorias" className="animate-fade-in">
            <div className="p-4">
              <CategoryManager
                categories={categories}
                products={products}
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
                <p className="text-sm text-text-secondary text-center py-4">Solo el propietario puede ver el historial. Pide acceso al propietario.</p>
              ) : (
                <MovementHistory products={products} tenantId={tenantId} />
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

      {showAdjustment && (
        <StockAdjustmentModal
          open={showAdjustment}
          onClose={closeAdjustment}
          product={products.find((p) => p.id === adjProductId)}
          adjMode={adjMode}
          adjQuantity={adjQuantity}
          adjReasonType={adjReasonType}
          adjCostTotal={adjCostTotal}
          adjShowCostInput={adjShowCostInput}
          adjHasCost={adjHasCost}
          adjError={adjError}
          adjSubmitting={adjSubmitting}
          isOnline={isOnline}
          onSetMode={setAdjMode}
          onSetQuantity={setAdjQuantity}
          onSetReasonType={setAdjReasonType}
          onSetCostTotal={setAdjCostTotal}
          onSetShowCostInput={setAdjShowCostInput}
          onSetError={setAdjError}
          onSubmit={handleSubmitAdjustment}
        />
      )}

      {showBulkAdjustment && (() => {
        const bulkProducts = bulkProductIds
          .map(id => products.find(p => p.id === id))
          .filter(Boolean) as Product[];

        const rawQty = parseFloat(bulkAdjQuantity);
        const hasValidQty = !isNaN(rawQty) && rawQty > 0;

        const hasWeighted = bulkProducts.some(p => p.isWeighted);
        const hasUnit = bulkProducts.some(p => !p.isWeighted);
        const hasMixedUnits = hasWeighted && hasUnit;

        const REASON_OPTIONS: { value: AdjustmentReason; label: string }[] = [
          { value: 'inventario_inicial', label: 'Error de ingreso inicial' },
          { value: 'perdida', label: 'Pérdida' },
          { value: 'robo', label: 'Robo' },
          { value: 'vencido', label: 'Vencido' },
          { value: 'consumo_interno', label: 'Consumo interno' },
          { value: 'otros', label: 'Otros' },
        ];

        return (
          <Modal
            isOpen={showBulkAdjustment}
            onClose={() => { setShowBulkAdjustment(false); setBulkProductIds([]); }}
            title="Ajuste masivo de stock"
            footer={
              <div className="flex gap-3 w-full">
                <Button variant="ghost" fullWidth onClick={() => { setShowBulkAdjustment(false); setBulkProductIds([]); }}>Cancelar</Button>
                <Button variant="primary" fullWidth onClick={handleBulkSubmit} disabled={bulkAdjSubmitting || !isOnline}>
                  {bulkAdjSubmitting ? 'Ajustando...' : 'Ajustar stock'}
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              {hasMixedUnits && (
                <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-warning-dark">
                    Hay productos pesables (Kg/Lt) y por unidad en la selección. La cantidad se aplicará tal cual a cada producto.
                  </p>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-3 max-h-[40vh] overflow-y-auto">
                <p className="text-xs font-medium text-gray-500 mb-2">
                  {bulkProducts.length} producto{bulkProducts.length !== 1 ? 's' : ''} seleccionado{bulkProducts.length !== 1 ? 's' : ''}
                </p>
                <div className="space-y-1.5">
                  {bulkProducts.map(p => {
                    const displayStock = displayQty(p.stock, p.unit);
                    const unitLabel = p.unit === 'kg' ? 'Kg' : p.unit === 'lt' ? 'Lt' : p.unit === 'm' ? 'm' : 'un';
                    const currentQty = hasValidQty ? rawQty : 0;
                    const newStock = bulkAdjMode === 'restar'
                      ? p.stock - (p.unit === 'kg' || p.unit === 'lt' || p.unit === 'm' ? currentQty * 1000 : currentQty)
                      : p.stock + (p.unit === 'kg' || p.unit === 'lt' || p.unit === 'm' ? currentQty * 1000 : currentQty);
                    const newDisplay = displayQty(newStock, p.unit);
                    const wouldGoNegative = bulkAdjMode === 'restar' && newStock < 0;

                    return (
                      <div key={p.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                        <span className="text-gray-700 truncate min-w-0 flex-1 mr-2">{p.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-gray-500">{displayStock} {unitLabel}</span>
                          {hasValidQty && (
                            <>
                              <span className="text-xs text-gray-400">→</span>
                              <span className={`text-xs font-medium ${wouldGoNegative ? 'text-danger' : 'text-primary'}`}>
                                {newDisplay} {unitLabel}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="input-label">Tipo de ajuste</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setBulkAdjMode('sumar'); setBulkAdjQuantity(''); setBulkAdjError(''); }}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                      bulkAdjMode === 'sumar'
                        ? 'bg-success text-white shadow-sm'
                        : 'bg-gray-50 text-text-secondary hover:bg-gray-100 border border-border'
                    }`}
                  >
                    <Plus size={16} />
                    Sumar stock
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBulkAdjMode('restar'); setBulkAdjQuantity(''); setBulkAdjError(''); setBulkAdjReasonType('perdida'); }}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                      bulkAdjMode === 'restar'
                        ? 'bg-danger text-white shadow-sm'
                        : 'bg-gray-50 text-text-secondary hover:bg-gray-100 border border-border'
                    }`}
                  >
                    <Minus size={16} />
                    Restar stock
                  </button>
                </div>
              </div>

              <div className="input-wrapper">
                <label className="input-label">Cantidad {bulkAdjMode === 'sumar' ? 'a sumar' : 'a restar'}</label>
                <Input
                  sanitize="number"
                  decimals={2}
                  inputMode="decimal"
                  placeholder="Ej: 10"
                  value={bulkAdjQuantity}
                  onChange={(e) => { setBulkAdjQuantity(e.target.value); setBulkAdjError(''); }}
                  validation={{ required: true, min: 0.01 }}
                  error={bulkAdjError}
                  inputClassName="text-sm"
                />
                {hasMixedUnits && hasValidQty && (
                  <p className="text-xs text-gray-500 mt-1">
                    Para pesables: {rawQty} Kg/Lt = {rawQty * 1000} unidades internas
                  </p>
                )}
              </div>

              <div className="input-wrapper">
                <label className="input-label">Motivo</label>
                <SearchableSelect
                  value={bulkAdjReasonType}
                  onChange={(v) => { setBulkAdjReasonType(v); setBulkAdjError(''); }}
                  options={REASON_OPTIONS}
                  hideSearch
                />
              </div>
            </div>
          </Modal>
        );
      })()}

      {bulkPrice.showModal && (
        <BulkPriceUpdateModal
          open={bulkPrice.showModal}
          onClose={bulkPrice.closeModal}
          selectedProducts={products.filter((p) => bulkPrice.selectedIds.includes(p.id))}
          bulkPrice={bulkPrice}
          isOnline={isOnline}
        />
      )}

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
              const displayStock_val = displayQty(product.stock, product.unit);
              const displayMin = displayQty(product.stockMin ?? 0, product.unit);
              const unitLabel = product.unit === 'kg' ? 'Kg' : product.unit === 'lt' ? 'Lt' : product.unit === 'm' ? 'm' : '';
              const isSelected = selectedForOrder.has(product.id);
              const isZero = product.stock <= 0;
              const isProduced = producedProductIds.has(product.id);

              return (
                <div
                  key={product.id}
                  onClick={() => !isProduced && handleToggleProduct(product.id)}
                  className={`rounded-lg p-3 border transition-all duration-200 ${
                    isProduced
                      ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
                      : isSelected
                        ? 'border-primary ring-1 ring-primary/30 bg-primary/2 cursor-pointer'
                        : 'border-border hover:border-primary/30 hover:bg-gray-50/50 cursor-pointer'
                  } ${isZero && !isProduced ? 'low-stock-card--danger' : ''}`}
                  style={!isSelected && !isZero && !isProduced ? { borderLeftColor: 'var(--color-warning)' } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">
                      {isProduced ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-info/10 text-info text-[10px] font-bold" title="Se produce, no se compra">P</span>
                      ) : isSelected ? (
                        <CheckCircle2 size={20} className="text-primary" />
                      ) : (
                        <Circle size={20} className="text-gray-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 wrap-break-word">{product.name}</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Stock: <span className={`font-medium ${isZero ? 'text-danger' : ''}`}>{displayStock_val} {unitLabel}</span>
                        {' / '}Mín: {displayMin} {unitLabel}
                      </p>
                      {isProduced && (
                        <p className="text-[10px] text-info mt-0.5 font-medium">Se produce, no se puede comprar</p>
                      )}
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
      />
    </div>
  );
}
