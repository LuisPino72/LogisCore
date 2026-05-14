import { useState } from 'react';
import { Truck, ShoppingCart, Plus, Search, AlertTriangle } from 'lucide-react';
import { Button, Card, EmptyState, Input, Modal } from '../../../common/components';
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

  if (!tenantId) {
    return <EmptyState icon={<ShoppingCart size={48} />} title="Selecciona un tenant" description="No hay tenant activo" />;
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-title font-bold">Compras</h1>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 items-center scrollbar-none">
        <Button
          variant={activeTab === 'ordenes' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('ordenes')}
          className="shrink-0"
        >
          <ShoppingCart size={16} />
          <span className="ml-1">Órdenes</span>
        </Button>
        <Button
          variant={activeTab === 'proveedores' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('proveedores')}
          className="shrink-0"
        >
          <Truck size={16} />
          <span className="ml-1">Proveedores</span>
        </Button>
      </div>

      <Card>
        {activeTab === 'ordenes' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Buscar orden..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputClassName="text-sm"
                />
              </div>
              {isOwner && (
                <Button variant="primary" size="sm" onClick={openNewOrder}>
                  <Plus size={16} />
                  <span className="hidden sm:inline ml-1">Nueva orden</span>
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Buscar proveedor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputClassName="text-sm pl-9"
                />
              </div>
              {isOwner && (
                <Button variant="primary" size="sm" onClick={openNewSupplier}>
                  <Plus size={16} />
                  <span className="hidden sm:inline ml-1">Nuevo</span>
                </Button>
              )}
            </div>
            <SupplierList
              suppliers={suppliers.filter((s) =>
                s.name.toLowerCase().includes(search.toLowerCase())
              )}
              loading={loading}
              isOwner={isOwner}
              onEdit={handleEditSupplier}
              onDelete={(id, name) => setConfirmDeleteSupplier({ id, name })}
            />
          </div>
        )}
      </Card>

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
