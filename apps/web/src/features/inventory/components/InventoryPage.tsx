import { useState, useEffect, useRef } from 'react';
import { Package, ListTree, History, AlertTriangle } from 'lucide-react';
import { Button, Card, EmptyState, Modal, Input } from '../../../common/components';
import { useInventory } from '../hooks/useInventory';
import { useStockAlerts } from '../hooks/useStockAlerts';
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

  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const { totalLowStock } = useStockAlerts(tenantId);
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

  const isOwner = role === 'owner' || role === 'admin';

  const tabs = [
    { id: 'productos' as const, label: 'Productos', icon: <Package size={16} /> },
    { id: 'categorias' as const, label: 'Categorías', icon: <ListTree size={16} /> },
    { id: 'historial' as const, label: 'Historial', icon: <History size={16} /> },
  ];

  const handleCreateProduct = async (data: CreateProductInput & { stockInicial: number }, imageFile?: File | null) => {
    if (!tenantId || !userId) return false;
    const product = await createProduct(tenantId, userId, data);
    if (product && imageFile) {
      await inventoryService.uploadProductImage(imageFile, tenantId, product.id);
    }
    if (product) setShowProductForm(false);
    return !!product;
  };

  const handleEditProduct = async (data: CreateProductInput & { stockInicial: number }, imageFile?: File | null) => {
    if (!editProduct || !tenantId) return false;
    const ok = await updateProduct(editProduct.id, data, tenantId);
    if (ok && imageFile) {
      await inventoryService.uploadProductImage(imageFile, tenantId, editProduct.id);
      refresh();
    }
    if (ok) setShowProductForm(false);
    return ok;
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

  // Ensure active tab button is centered in view
  useEffect(() => {
    if (tabsContainerRef.current) {
      const activeBtn = document.getElementById(`tab-${activeTab}`) as HTMLElement | null;
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeTab]);

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
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-title font-bold">Inventario</h1>
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
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-title font-bold">Inventario</h1>
        <div className="flex items-center gap-2">
          {totalLowStock > 0 && <LowStockBadge count={totalLowStock} />}
        </div>
      </div>

      <div ref={tabsContainerRef} className="flex gap-1 overflow-x-auto pb-1 items-center scrollbar-none">

        {tabs.map((tab) => (
          <Button
            id={`tab-${tab.id}`}
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className="shrink-0"
          >
            {tab.icon}
            <span className="ml-1">{tab.label}</span>
          </Button>
        ))}

      
        
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

        {/* removed ajustes tab content — functionality moved to modal triggered by + button */}

        {activeTab === 'historial' && (
          <div className="p-4">
            <h2 className="text-sm font-semibold mb-4">Historial de movimientos</h2>
            {!isOwner ? (
              <p className="text-sm text-gray-500">Solo el propietario puede ver el historial.</p>
            ) : (
              <MovementHistory products={products} />
            )}
          </div>
        )}
      </Card>

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
        <Modal isOpen={showAdjustment} onClose={() => { setShowAdjustment(false); setSelectedProductId(null); }} title="Ajuste de stock">
          <div className="space-y-4">
            <div className="input-wrapper">
              <label className="input-label">Producto</label>
              <select className="select" value={adjProductId} onChange={(e) => setAdjProductId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>
            </div>

            {products.find((p) => p.id === adjProductId) && (
              <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                Stock actual: <strong>{products.find((p) => p.id === adjProductId)?.stock}</strong>
              </div>
            )}

            <div className="input-wrapper">
              <label className="input-label">Cantidad</label>
              <Input type="number" step="0.01" placeholder="Ej: 10 o -5" value={adjQuantity} onChange={(e) => setAdjQuantity(e.target.value)} inputClassName="text-sm px-2 py-2" />
            </div>

            <div className="input-wrapper">
              <label className="input-label">Motivo (obligatorio)</label>
              <Input placeholder="Ej: merma por rotura, stock inicial, devolución" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} inputClassName="text-sm px-2 py-2" />
            </div>

            {adjError && <p className="text-xs text-danger">{adjError}</p>}

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => { setShowAdjustment(false); setSelectedProductId(null); }}>Cancelar</Button>
              <Button variant="primary" fullWidth onClick={handleSubmitAdjustment} disabled={adjSubmitting}>{adjSubmitting ? 'Ajustando...' : 'Ajustar stock'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal isOpen={true} onClose={() => setConfirmDelete(null)} title="Confirmar eliminación">
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
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setConfirmDelete(null)}>
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={handleConfirmDelete}>
                Eliminar
              </Button>
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
    </div>
  );
}
