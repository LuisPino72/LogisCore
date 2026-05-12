import { useState } from 'react';
import { Package, ListTree, Plus, History, AlertTriangle } from 'lucide-react';
import { Button, Card, EmptyState, Modal } from '../../../common/components';
import { useInventory } from '../hooks/useInventory';
import { useStockAlerts } from '../hooks/useStockAlerts';
import { ProductList } from './ProductList';
import { ProductForm } from './ProductForm';
import { CategoryManager } from './CategoryManager';
import { StockAdjustmentModal } from './StockAdjustmentModal';
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
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);

  const isOwner = role === 'owner' || role === 'admin';

  const tabs = [
    { id: 'productos' as const, label: 'Productos', icon: <Package size={16} /> },
    { id: 'categorias' as const, label: 'Categorías', icon: <ListTree size={16} /> },
    { id: 'ajustes' as const, label: 'Ajustes', icon: <Plus size={16} /> },
    { id: 'historial' as const, label: 'Historial', icon: <History size={16} /> },
  ];

  const handleCreateProduct = async (data: CreateProductInput & { stockInicial: number }) => {
    if (!tenantId || !userId) return false;
    const ok = await createProduct(tenantId, userId, data);
    if (ok) setShowProductForm(false);
    return ok;
  };

  const handleEditProduct = async (data: CreateProductInput & { stockInicial: number }) => {
    if (!editProduct || !tenantId) return false;
    const ok = await updateProduct(editProduct.id, data, tenantId);
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

      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <Button
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
            onViewHistory={(id) => { setSelectedProductId(id); setActiveTab('historial'); }}
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

        {activeTab === 'ajustes' && (
          <div className="p-4">
            <h2 className="text-sm font-semibold mb-4">Ajuste manual de stock</h2>
            {!isOwner ? (
              <p className="text-sm text-gray-500">Solo el propietario puede hacer ajustes.</p>
            ) : (
              <StockAdjustmentModal
                isOpen={true}
                products={products}
                onAdjust={handleAdjustStock}
                onClose={() => setActiveTab('productos')}
              />
            )}
          </div>
        )}

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

      {showAdjustment && selectedProductId && (
        <StockAdjustmentModal
          isOpen={showAdjustment}
          onClose={() => { setShowAdjustment(false); setSelectedProductId(null); }}
          products={products}
          selectedProductId={selectedProductId}
          onAdjust={handleAdjustStock}
        />
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
    </div>
  );
}
