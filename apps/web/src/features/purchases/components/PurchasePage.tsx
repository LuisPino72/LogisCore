import { useState, useMemo } from 'react';
import { ShoppingCart, Truck, AlertTriangle } from 'lucide-react';
import { Button, Card, EmptyState, SearchInput, BottomNav, type BottomNavItem, Modal } from '../../../common/components';
import { cn } from '../../../lib/utils';
import { usePurchases } from '../hooks/usePurchases';
import { SupplierList } from './SupplierList';
import { SupplierForm } from './SupplierForm';
import { OrderList } from './OrderList';
import { OrderForm } from './OrderForm';
import type { CreateSupplierInput, CreatePurchaseOrderInput, Supplier, PurchaseOrderWithItems } from '../../../specs/purchases';

interface ConfirmDeleteSupplier {
  id: string;
  name: string;
}

interface PurchasePageProps {
  tenantId: string | null;
}

export function PurchasePage({ tenantId }: PurchasePageProps) {
  const {
    suppliers, orders, loading, activeTab, setActiveTab,
    createSupplier, updateSupplier, deleteSupplier, createOrder, updateOrder, softDeleteOrder,
    confirmOrder, receiveOrder, cancelOrder,
    refresh, userId, role,
  } = usePurchases(tenantId);

  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [editOrder, setEditOrder] = useState<PurchaseOrderWithItems | null>(null);
  const [confirmDeleteSupplier, setConfirmDeleteSupplier] = useState<ConfirmDeleteSupplier | null>(null);
  const [confirmCancelOrder, setConfirmCancelOrder] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');

  const isOwner = role === 'owner' || role === 'admin';

  const pendingOrdersCount = useMemo(
    () => orders.filter((o) => o.status === 'draft' || o.status === 'confirmed' || o.status === 'partially_received').length,
    [orders]
  );

  const handleCreateSupplier = async (data: CreateSupplierInput) => {
    if (!tenantId || !userId) return false;
    if (editSupplier) {
      return updateSupplier(editSupplier.id, data, tenantId);
    }
    return createSupplier(tenantId, userId, data);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditSupplier(supplier);
    setShowSupplierForm(true);
  };

  const handleConfirmDeleteSupplier = async () => {
    if (!confirmDeleteSupplier || !tenantId) return;
    await deleteSupplier(confirmDeleteSupplier.id, tenantId);
    setConfirmDeleteSupplier(null);
  };

  const handleCreateOrder = async (data: CreatePurchaseOrderInput) => {
    if (!tenantId || !userId) return false;
    if (editOrder) {
      return updateOrder(editOrder.id, tenantId, userId, data);
    }
    return createOrder(tenantId, userId, data);
  };

  const handleEditOrder = (order: PurchaseOrderWithItems) => {
    setEditOrder(order);
    setShowOrderForm(true);
  };

  const openNewOrder = () => {
    setEditOrder(null);
    setShowOrderForm(true);
  };

  const handleConfirmCancelOrder = async () => {
    if (!confirmCancelOrder || !tenantId) return;
    await cancelOrder(confirmCancelOrder.id, tenantId);
    setConfirmCancelOrder(null);
  };

  const handleConfirmDeleteOrder = async () => {
    if (!confirmDeleteOrder || !tenantId) return;
    await softDeleteOrder(confirmDeleteOrder.id, tenantId);
    setConfirmDeleteOrder(null);
  };

  const openNewSupplier = () => {
    setEditSupplier(null);
    setShowSupplierForm(true);
  };

  const bottomNavItems: BottomNavItem[] = useMemo(() => [
    {
      id: 'ordenes',
      label: 'Órdenes',
      icon: <ShoppingCart size={20} />,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
      onClick: () => setActiveTab('ordenes'),
    },
    {
      id: 'proveedores',
      label: 'Proveedores',
      icon: <Truck size={20} />,
      onClick: () => setActiveTab('proveedores'),
    },
  ], [pendingOrdersCount, setActiveTab]);

  if (!tenantId) {
    return <EmptyState icon={<ShoppingCart size={48} />} title="Selecciona un tenant" description="No hay tenant activo" />;
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-20 sm:pb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ShoppingCart size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-title font-bold" style={{ fontSize: 'var(--text-fluid-xl)' }}>Compras</h1>
          <p className="text-xs text-text-secondary">Gestiona órdenes y proveedores</p>
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-1 border-b border-gray-200 pb-0">
        <button
          type="button"
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'ordenes'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-gray-700'
          )}
          onClick={() => setActiveTab('ordenes')}
        >
          <ShoppingCart size={16} className="inline mr-1.5 -mt-0.5" />
          Órdenes
        </button>
        <button
          type="button"
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'proveedores'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-gray-700'
          )}
          onClick={() => setActiveTab('proveedores')}
        >
          <Truck size={16} className="inline mr-1.5 -mt-0.5" />
          Proveedores
        </button>
      </div>

      <Card>
        {activeTab === 'ordenes' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchInput
                  placeholder="Buscar orden..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClear={() => setSearch('')}
                />
              </div>
              {isOwner && (
                <Button variant="primary" size="sm" onClick={openNewOrder} className="shrink-0">
                  <span className="hidden sm:inline">Nueva orden</span>
                  <span className="sm:hidden">+</span>
                </Button>
              )}
            </div>
            <OrderList
              orders={orders.filter((o) =>
                o.supplierName?.toLowerCase().includes(search.toLowerCase()) ||
                o.id.toLowerCase().includes(search.toLowerCase())
              )}
              loading={loading}
              isOwner={isOwner}
              onConfirm={confirmOrder}
              onReceive={(id, items) => {
                if (!tenantId || !userId) return Promise.resolve(false);
                return receiveOrder(id, { orderId: id, items }, tenantId, userId);
              }}
              onCancel={(id) => {
                const order = orders.find((o) => o.id === id);
                setConfirmCancelOrder({ id, name: order?.supplierName ?? '' });
              }}
              onEdit={handleEditOrder}
              onDeleteOrder={(id, name) => setConfirmDeleteOrder({ id, name })}
              onRefresh={refresh}
              tenantId={tenantId}
            />
          </div>
        )}

        {activeTab === 'proveedores' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchInput
                  placeholder="Buscar proveedor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClear={() => setSearch('')}
                />
              </div>
              {isOwner && (
                <Button variant="primary" size="sm" onClick={openNewSupplier} className="shrink-0">
                  <span className="hidden sm:inline">Nuevo</span>
                  <span className="sm:hidden">+</span>
                </Button>
              )}
            </div>
            <SupplierList
              suppliers={suppliers.filter((s) =>
                s.name.toLowerCase().includes(search.toLowerCase())
              )}
              loading={loading}
              isOwner={isOwner}
              activeOrdersBySupplier={orders.reduce((acc, o) => {
                if (o.status !== 'received' && o.status !== 'cancelled') {
                  acc[o.supplierId] = (acc[o.supplierId] || 0) + 1;
                }
                return acc;
              }, {} as Record<string, number>)}
              onEdit={handleEditSupplier}
              onDelete={(id, name) => setConfirmDeleteSupplier({ id, name })}
            />
          </div>
        )}
      </Card>

      <BottomNav items={bottomNavItems} activeId={activeTab} className="sm:hidden" />

      {showSupplierForm && (
        <SupplierForm
          isOpen={showSupplierForm}
          onClose={() => { setShowSupplierForm(false); setEditSupplier(null); }}
          onSubmit={handleCreateSupplier}
          editSupplier={editSupplier}
        />
      )}

      {showOrderForm && (
        <OrderForm
          isOpen={showOrderForm}
          onClose={() => { setShowOrderForm(false); setEditOrder(null); }}
          onSubmit={handleCreateOrder}
          suppliers={suppliers}
          tenantId={tenantId}
          editOrder={editOrder}
        />
      )}

      {confirmDeleteSupplier && (
        <Modal isOpen={true} onClose={() => setConfirmDeleteSupplier(null)} title="Confirmar eliminación">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-danger" />
              </div>
              <div>
                <p className="text-sm font-semibold">¿Eliminar proveedor {confirmDeleteSupplier.name}?</p>
                <p className="text-xs text-gray-500">
                  El proveedor se marcará como eliminado (soft delete).
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setConfirmDeleteSupplier(null)}>
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={handleConfirmDeleteSupplier}>
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmCancelOrder && (
        <Modal isOpen={true} onClose={() => setConfirmCancelOrder(null)} title="Cancelar orden">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-danger" />
              </div>
              <div>
                <p className="text-sm font-semibold">¿Cancelar orden de {confirmCancelOrder.name}?</p>
                <p className="text-xs text-gray-500">
                  La orden quedará marcada como cancelada y no podrá recibirse.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setConfirmCancelOrder(null)}>
                Volver
              </Button>
              <Button variant="danger" fullWidth onClick={handleConfirmCancelOrder}>
                Cancelar orden
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDeleteOrder && (
        <Modal isOpen={true} onClose={() => setConfirmDeleteOrder(null)} title="Eliminar orden">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-danger" />
              </div>
              <div>
                <p className="text-sm font-semibold">¿Eliminar orden de {confirmDeleteOrder.name}?</p>
                <p className="text-xs text-gray-500">
                  La orden se ocultará de la lista (soft delete).
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setConfirmDeleteOrder(null)}>
                Volver
              </Button>
              <Button variant="danger" fullWidth onClick={handleConfirmDeleteOrder}>
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
