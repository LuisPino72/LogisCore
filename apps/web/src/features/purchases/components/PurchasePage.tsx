import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ShoppingCart, Truck, AlertTriangle, Plus, ClipboardCheck } from 'lucide-react';
import { Button, Card, EmptyState, SearchInput, BottomNav, type BottomNavItem, Modal, ModuleOnboarding, DatePicker } from '../../../common/components';
import { cn } from '../../../lib/utils';
import { usePurchases } from '../hooks/usePurchases';
import { useToastStore } from '../../../stores/toastStore';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { SupplierList } from './SupplierList';
import { SupplierForm } from './SupplierForm';
import { OrderList } from './OrderList';
import { OrderForm } from './OrderForm';
import { inventoryService } from '../../inventory/services/inventoryService';
import type { Product } from '../../../specs/inventory';
import type { TabKey } from '../types';
import type { CreateSupplierInput, CreatePurchaseOrderInput, Supplier, PurchaseOrderWithItems, PurchaseOrderStatus } from '../../../specs/purchases';
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
    refresh, userId, role, tabStates, saveTabState, error: storeError,
  } = usePurchases(tenantId);
  const { addToast } = useToastStore();
  const isOnline = useOnlineStatus();

  const tabState = tabStates[activeTab];

  const location = useLocation();
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [editOrder, setEditOrder] = useState<PurchaseOrderWithItems | null>(null);
  const [preSelectedProducts, setPreSelectedProducts] = useState<Product[]>([]);
  const [createdSupplierId, setCreatedSupplierId] = useState<string | null>(null);
  const [confirmDeleteSupplier, setConfirmDeleteSupplier] = useState<ConfirmDeleteSupplier | null>(null);
  const [confirmCancelOrder, setConfirmCancelOrder] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState<{ id: string; name: string } | null>(null);
  const handleStatusFilter = (value: PurchaseOrderStatus | 'all', el: HTMLElement) => {
    saveTabState(activeTab, { statusFilter: value });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const statusOptions: { value: PurchaseOrderStatus | 'all'; label: string; variant: 'neutral' | 'warning' | 'info' | 'success' | 'danger' }[] = [
    { value: 'all', label: 'Todas', variant: 'neutral' },
    { value: 'received', label: 'Recibida', variant: 'success' },
    { value: 'confirmed', label: 'Confirmada', variant: 'info' },
    { value: 'partially_received', label: 'Parcial', variant: 'warning' },
    { value: 'draft', label: 'Borrador', variant: 'warning' },
    { value: 'cancelled', label: 'Cancelada', variant: 'danger' },
  ];

  const isOwner = role === 'owner' || role === 'admin';

  useEffect(() => {
    const state = location.state as { preSelectedProductIds?: string[] } | null;
    if (state?.preSelectedProductIds?.length && tenantId) {
      inventoryService.getProducts(tenantId).then((res) => {
        if (res.ok) {
          const selected = res.data.filter((p) => state.preSelectedProductIds!.includes(p.id));
          setPreSelectedProducts(selected);
          setEditOrder(null);
          setShowOrderForm(true);
        }
      });
      window.history.replaceState({}, '');
    }
  }, [location.state, tenantId]);

  const pendingOrdersCount = useMemo(
    () => orders.filter((o) => o.status === 'draft' || o.status === 'confirmed' || o.status === 'partially_received').length,
    [orders]
  );

  const handleCreateSupplier = async (data: CreateSupplierInput) => {
    if (!tenantId || !userId) return false;
    if (editSupplier) {
      const ok = await updateSupplier(editSupplier.id, data, tenantId);
      if (ok) addToast({ type: 'success', message: 'Proveedor actualizado.', duration: 3000 });
      return ok;
    }
    const newId = await createSupplier(tenantId, userId, data);
    if (newId) {
      setCreatedSupplierId(newId);
      addToast({ type: 'success', message: 'Proveedor creado.', duration: 3000 });
    }
    return !!newId;
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditSupplier(supplier);
    setShowSupplierForm(true);
  };

  const handleConfirmDeleteSupplier = async () => {
    if (!confirmDeleteSupplier || !tenantId) return;
    const success = await deleteSupplier(confirmDeleteSupplier.id, tenantId);
    if (success) {
      setConfirmDeleteSupplier(null);
    } else {
      // Usamos el error del store que ya fue actualizado por deleteSupplier
      addToast({
        type: 'error',
        message: storeError || 'No se pudo eliminar el proveedor',
      });
    }
  };

  const handleCreateOrder = async (data: CreatePurchaseOrderInput) => {
    if (!tenantId || !userId) return false;
    if (editOrder) {
      const ok = await updateOrder(editOrder.id, tenantId, userId, data);
      if (ok) addToast({ type: 'success', message: 'Orden actualizada.', duration: 3000 });
      return ok;
    }
    const ok = await createOrder(tenantId, userId, data);
    if (ok) addToast({ type: 'success', message: 'Orden creada.', duration: 3000 });
    return ok;
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
    addToast({ type: 'success', message: 'Orden cancelada.', duration: 3000 });
    setConfirmCancelOrder(null);
  };

  const handleConfirmDeleteOrder = async () => {
    if (!confirmDeleteOrder || !tenantId) return;
    await softDeleteOrder(confirmDeleteOrder.id, tenantId);
    addToast({ type: 'success', message: 'Orden eliminada.', duration: 3000 });
    setConfirmDeleteOrder(null);
  };

  const openNewSupplier = () => {
    setEditSupplier(null);
    setShowSupplierForm(true);
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
  };

  const bottomNavItems: BottomNavItem[] = useMemo(() => [
    {
      id: 'ordenes',
      label: 'Órdenes',
      icon: <ShoppingCart size={20} />,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
      onClick: () => handleTabChange('ordenes'),
    },
    {
      id: 'proveedores',
      label: 'Proveedores',
      icon: <Truck size={20} />,
      onClick: () => handleTabChange('proveedores'),
    },
  ], [pendingOrdersCount, setActiveTab]);

  if (!tenantId) {
    return <EmptyState icon={<ShoppingCart size={48} />} title="Selecciona un tenant" description="No hay tenant activo" />;
  }

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingCart size={18} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-title font-bold truncate" style={{ fontSize: 'var(--text-fluid-xl)' }}>Compras</h1>
            <p className="text-[11px] text-text-secondary hidden sm:block">Gestiona órdenes y proveedores</p>
          </div>
        </div>
        {isOwner && (
          <Button variant="primary" size="sm" onClick={activeTab === 'ordenes' ? openNewOrder : openNewSupplier} disabled={!isOnline} title={!isOnline ? 'Necesitas internet para esta acción' : undefined}>
            <Plus size={16} />
            <span className="hidden sm:inline">{activeTab === 'ordenes' ? 'Nueva orden' : 'Nuevo proveedor'}</span>
          </Button>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/60 p-1 sticky top-14 z-10 shadow-sm">
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200',
            activeTab === 'ordenes'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50'
          )}
          onClick={() => handleTabChange('ordenes')}
        >
          <ShoppingCart size={18} />
          Órdenes
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200',
            activeTab === 'proveedores'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50'
          )}
          onClick={() => handleTabChange('proveedores')}
        >
          <Truck size={18} />
          Proveedores
        </button>
      </div>

      <Card>
        {activeTab === 'ordenes' && (
          <div className="p-4 space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => handleStatusFilter(opt.value, e.currentTarget)}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap',
                    tabState.statusFilter === opt.value
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white text-text-secondary border-border hover:border-primary/30 hover:text-primary'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <SearchInput
                  placeholder="Buscar orden..."
                  value={tabState.searchQuery}
                  onChange={(e) => saveTabState(activeTab, { searchQuery: e.target.value })}
                  onClear={() => saveTabState(activeTab, { searchQuery: '' })}
                />
              </div>
              <div className="w-full sm:w-48">
                <DatePicker
                  value={tabState.dateFilter}
                  onChange={(e) => saveTabState(activeTab, { dateFilter: e.target.value })}
                  formatHint="dd/mm/aaaa"
                />
              </div>
              {tabState.dateFilter && (
                <button
                  type="button"
                  onClick={() => saveTabState(activeTab, { dateFilter: '' })}
                  className="text-xs text-primary font-medium px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors shrink-0"
                >
                  Limpiar
                </button>
              )}
            </div>
            <OrderList
              orders={orders.filter((o) => {
                const matchSearch = o.supplierName?.toLowerCase().includes(tabState.searchQuery.toLowerCase()) ||
                  o.id.toLowerCase().includes(tabState.searchQuery.toLowerCase());
                const matchStatus = tabState.statusFilter === 'all' || o.status === tabState.statusFilter;
                if (!tabState.dateFilter) return matchSearch && matchStatus;
                const orderDate = o.createdAt.slice(0, 10);
                return matchSearch && matchStatus && orderDate === tabState.dateFilter;
              })}
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
            <SearchInput
              placeholder="Buscar proveedor..."
              value={tabState.searchQuery}
              onChange={(e) => saveTabState(activeTab, { searchQuery: e.target.value })}
              onClear={() => saveTabState(activeTab, { searchQuery: '' })}
            />
            <SupplierList
              suppliers={suppliers.filter((s) =>
                s.name.toLowerCase().includes(tabState.searchQuery.toLowerCase())
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
          onClose={() => { setShowOrderForm(false); setEditOrder(null); setPreSelectedProducts([]); setCreatedSupplierId(null); }}
          onSubmit={handleCreateOrder}
          suppliers={suppliers}
          tenantId={tenantId}
          editOrder={editOrder}
          preSelectedProducts={preSelectedProducts}
          autoSelectSupplierId={createdSupplierId}
          onRequestCreateSupplier={() => { setEditSupplier(null); setShowSupplierForm(true); }}
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
                  El proveedor se borrará definitivamente.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setConfirmDeleteSupplier(null)}>
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={handleConfirmDeleteSupplier} disabled={!isOnline}>
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
              <Button variant="danger" fullWidth onClick={handleConfirmCancelOrder} disabled={!isOnline}>
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
                  La orden se ocultará de la lista.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setConfirmDeleteOrder(null)}>
                Volver
              </Button>
              <Button variant="danger" fullWidth onClick={handleConfirmDeleteOrder} disabled={!isOnline}>
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ModuleOnboarding
        moduleId="purchases"
        steps={[
          {
            title: 'Gestiona tus Compras',
            description: 'Aquí creas órdenes de compra a tus proveedores y registras la recepción de productos. Cada orden actualiza automáticamente tu inventario.',
            icon: <ShoppingCart size={24} className="text-white" />,
          },
          {
            title: 'Proveedores',
            description: 'Registra tus proveedores con nombre, RIF y contacto. Así podrás crear órdenes de compra rápidamente seleccionándolos.',
            icon: <Truck size={24} className="text-white" />,
          },
          {
            title: 'Recibir Órdenes',
            description: 'Cuando llegue tu pedido, toca "Recibir" en la orden. Puedes recibir parcialmente si no llegó todo. El stock se actualiza automáticamente.',
            icon: <ClipboardCheck size={24} className="text-white" />,
          },
        ]}
        onComplete={() => {}}
      />
    </div>
  );
}
