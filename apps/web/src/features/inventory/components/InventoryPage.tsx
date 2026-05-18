import { useState } from 'react';
import { Package, ListTree, History, AlertTriangle, Plus, Settings } from 'lucide-react';
import { Button, Card, EmptyState, Modal, Input, BottomNav, SearchInput, ModuleOnboarding } from '../../../common/components';
import { useInventory } from '../hooks/useInventory';
import { useStockAlerts } from '../hooks/useStockAlerts';
import { useToastStore } from '../../../stores/toastStore';
import { inventoryService } from '../services/inventoryService';
import { ProductList } from './ProductList';
import { ProductForm } from './ProductForm';
import { ProductLots } from './ProductLots';
import { KardexView } from './KardexView';
import { CategoryManager } from './CategoryManager';
import { MovementHistory } from './MovementHistory';
import { LowStockBadge } from './LowStockBadge';
import type { CreateProductInput, Product } from '../types';

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
    createProduct, updateProduct, deleteProduct, createCategory, updateCategory, deleteCategory, adjustStock,
    search, refresh, userId, role,
  } = useInventory(tenantId);

  const { totalLowStock } = useStockAlerts(tenantId);
  const { addToast } = useToastStore();
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [, setSelectedProductId] = useState<string | null>(null);
  const [adjProductId, setAdjProductId] = useState<string>('');
  const [adjQuantity, setAdjQuantity] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjError, setAdjError] = useState('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const [selectedProductLotsId, setSelectedProductLotsId] = useState<string | null>(null);
  const [selectedKardexProduct, setSelectedKardexProduct] = useState<{ id: string; name: string } | null>(null);
  const [adjProductSearch, setAdjProductSearch] = useState('');

  const isOwner = role === 'owner' || role === 'admin';

  const handleCreateProduct = async (data: CreateProductInput & { stockInicial: number }, imageFile?: File | null) => {
    if (!tenantId || !userId) return false;
    const product = await createProduct(tenantId, userId, data);
    if (product && imageFile) {
      const imgResult = await inventoryService.uploadProductImage(imageFile, tenantId, product.id);
      if (!imgResult.ok) {
        addToast({ type: 'warning', message: `Producto creado, pero la imagen no se pudo subir: ${imgResult.error?.message}`, duration: 5000 });
      }
    }
    if (product) setShowProductForm(false);
    return !!product;
  };

  const handleEditProduct = async (data: CreateProductInput & { stockInicial: number }, imageFile?: File | null) => {
    if (!editProduct || !tenantId) return false;
    const ok = await updateProduct(editProduct.id, data, tenantId);
    if (!ok) {
      addToast({ type: 'error', message: 'Error al actualizar el producto. Verifica que los datos sean correctos y que el SKU no esté duplicado.', duration: 5000 });
      return false;
    }
    if (imageFile) {
      const imgResult = await inventoryService.uploadProductImage(imageFile, tenantId, editProduct.id);
      if (!imgResult.ok) {
        addToast({ type: 'warning', message: `Producto actualizado, pero la imagen no se pudo subir: ${imgResult.error?.message}`, duration: 5000 });
      }
      refresh();
    }
    setShowProductForm(false);
    return true;
  };

  const handleAdjustStock = async (productId: string, quantity: number, reason: string) => {
    if (!tenantId || !userId) return false;
    return adjustStock({ productId, quantity, reason, userId, tenantId });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete || !tenantId) return;
    if (confirmDelete.type === 'product') {
      await deleteProduct(confirmDelete.id, tenantId);
    } else {
      await deleteCategory(confirmDelete.id, tenantId);
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
    if (!adjProductId) { setAdjError('Selecciona un producto'); return; }
    const qty = parseFloat(adjQuantity);
    if (isNaN(qty) || qty === 0) { setAdjError('Ingresa una cantidad válida (positiva o negativa)'); return; }
    if (!adjReason.trim()) { setAdjError('El motivo es obligatorio'); return; }

    setAdjSubmitting(true);
    setAdjError('');
    const ok = await handleAdjustStock(adjProductId, qty, adjReason.trim());
    setAdjSubmitting(false);

    if (ok) {
      setAdjQuantity('');
      setAdjReason('');
      setSelectedProductId(null);
      setShowAdjustment(false);
    } else {
      setAdjError('Error al ajustar stock. Verifica el stock disponible.');
    }
  };

  if (!tenantId) {
    return <EmptyState icon={<Package size={48} />} title="Selecciona un tenant" description="No hay tenant activo" />;
  }

  if (loading && products.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-title font-bold" style={{ fontSize: 'var(--text-fluid-xl)' }}>Inventario</h1>
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
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-20 sm:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Package size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-title font-bold" style={{ fontSize: 'var(--text-fluid-xl)' }}>Inventario</h1>
            <p className="text-xs text-text-secondary">Gestiona productos y stock</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalLowStock > 0 && <LowStockBadge count={totalLowStock} />}
          {isOwner && (
            <Button variant="primary" size="sm" onClick={openNewProduct}>
              <Plus size={16} />
              <span className="hidden sm:inline">Nuevo producto</span>
            </Button>
          )}
        </div>
      </div>

      {/* Desktop tabs */}
      <div className="hidden sm:flex items-center gap-1 border-b border-gray-200 bg-white sticky top-14 z-10">
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-sm font-title font-medium border-b-2 transition-colors ${
            activeTab === 'productos'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('productos')}
        >
          <Package size={20} />
          Productos
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-sm font-title font-medium border-b-2 transition-colors ${
            activeTab === 'categorias'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('categorias')}
        >
          <ListTree size={20} />
          Categorías
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-sm font-title font-medium border-b-2 transition-colors ${
            activeTab === 'historial'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('historial')}
        >
          <History size={20} />
          Historial
        </button>
      </div>

      <Card>
        {activeTab === 'productos' && (
          <ProductList
            products={products}
            categories={categories}
            onSearch={search}
            isOwner={isOwner}
            onNewProduct={openNewProduct}
            onEditProduct={openEditProduct}
            onRequestDelete={(id, name) => setConfirmDelete({ type: 'product', id, name })}
            onAdjust={(id) => { setSelectedProductId(id); setShowAdjustment(true); }}
            onViewLots={(id) => setSelectedProductLotsId(id)}
            onViewKardex={(id) => {
              const product = products.find((p) => p.id === id);
              if (product) setSelectedKardexProduct({ id: product.id, name: product.name });
            }}
            onRefresh={refresh}
          />
        )}

        {activeTab === 'categorias' && (
          <div className="p-4">
            <CategoryManager
              categories={categories}
              isOwner={isOwner}
              onCreate={async (name) => { if (!tenantId) return false; return createCategory(name, tenantId); }}
              onUpdate={async (id, name) => { if (!tenantId) return false; return updateCategory(id, name, tenantId); }}
              onRequestDelete={(id, name) => setConfirmDelete({ type: 'category', id, name })}
            />
          </div>
        )}

        {activeTab === 'historial' && (
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
        />
      )}

      {showAdjustment && (
        <Modal
          isOpen={showAdjustment}
          onClose={() => { setShowAdjustment(false); setSelectedProductId(null); setAdjProductSearch(''); }}
          title="Ajuste de stock"
          footer={
            <div className="flex gap-3 w-full">
              <Button variant="ghost" fullWidth onClick={() => { setShowAdjustment(false); setSelectedProductId(null); }}>Cancelar</Button>
              <Button variant="primary" fullWidth onClick={handleSubmitAdjustment} disabled={adjSubmitting}>{adjSubmitting ? 'Ajustando...' : 'Ajustar stock'}</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="input-label">Producto</label>
              <SearchInput
                placeholder="Buscar por nombre o SKU..."
                value={adjProductSearch}
                onChange={(e) => setAdjProductSearch(e.target.value)}
                onClear={() => setAdjProductSearch('')}
              />
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {products
                  .filter((p) =>
                    p.name.toLowerCase().includes(adjProductSearch.toLowerCase()) ||
                    p.sku.toLowerCase().includes(adjProductSearch.toLowerCase())
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm transition-colors min-h-[44px] ${
                        adjProductId === p.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        setAdjProductId(p.id);
                        setAdjProductSearch('');
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-gray-400 ml-2">({p.sku})</span>
                    </button>
                  ))}
                {products.filter((p) =>
                  p.name.toLowerCase().includes(adjProductSearch.toLowerCase()) ||
                  p.sku.toLowerCase().includes(adjProductSearch.toLowerCase())
                ).length === 0 && (
                  <div className="px-3 py-4 text-sm text-gray-400 text-center">
                    No se encontraron productos
                  </div>
                )}
              </div>
            </div>

            {products.find((p) => p.id === adjProductId) && (
              <div className="text-xs text-text-secondary bg-gray-50 p-2 rounded">
                Stock actual: <strong>{products.find((p) => p.id === adjProductId)?.stock}</strong>
              </div>
            )}

            <div className="input-wrapper">
              <label className="input-label">Cantidad</label>
              <Input type="number" step="0.01" placeholder="Ej: 10 o -5" value={adjQuantity} onChange={(e) => setAdjQuantity(e.target.value)} inputClassName="text-sm" />
            </div>

            <div className="input-wrapper">
              <label className="input-label">Motivo (obligatorio)</label>
              <Input placeholder="Ej: merma por rotura, stock inicial, devolución" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} inputClassName="text-sm" />
            </div>

            {adjError && <p className="text-xs text-danger">{adjError}</p>}
          </div>
        </Modal>
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
              <Button variant="danger" fullWidth onClick={handleConfirmDelete}>
                Eliminar
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-danger" />
              </div>
              <div>
                <p className="text-sm font-semibold">¿Eliminar {confirmDelete.name}?</p>
                <p className="text-xs text-gray-500">
                  {confirmDelete.type === 'product'
                    ? 'El producto se marcará como eliminado (soft delete).'
                    : 'La categoría se marcará como eliminada (soft delete).'}
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
          <ProductLots productId={selectedProductLotsId} tenantId={tenantId} />
        </Modal>
      )}

      {selectedKardexProduct && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedKardexProduct(null)}
          title={`Kardex - ${selectedKardexProduct.name}`}
        >
          <KardexView productId={selectedKardexProduct.id} productName={selectedKardexProduct.name} />
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
    </div>
  );
}
