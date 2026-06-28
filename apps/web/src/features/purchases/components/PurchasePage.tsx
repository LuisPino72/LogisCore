import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ShoppingCart, Truck, AlertTriangle, Plus, ClipboardCheck } from 'lucide-react';
import { Button, Card, EmptyState, SearchInput, BottomNav, type BottomNavItem, Modal, ModuleOnboarding, DatePicker } from '../../../common/components';
import { cn } from '../../../lib/utils';
import { useFuzzySearch } from '../../../lib/useFuzzySearch';
import { usePurchases } from '../hooks/usePurchases';
import { useToastStore } from '../../../stores/toastStore';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { SupplierList } from './SupplierList';
import { SupplierForm } from './SupplierForm';
import { OrderList } from './OrderList';
import { PaySupplierModal } from './PaySupplierModal';
import { OrderForm } from './OrderForm';
import { usePurchaseStore } from '../stores/purchaseStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
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
  const [payOrder, setPayOrder] = useState<PurchaseOrderWithItems | null>(null);
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
  const session = useAuthStore((s) => s.session);
  const canCreate = hasActionPermission(session, 'purchases', 'create');

  useEffect(() => {
    const state = location.state as { preSelectedProductIds?: string[] } | null;
    if (state?.preSelectedProductIds?.length && tenantId) {
      usePurchaseStore.getState().resolvePreSelectedProducts(tenantId, state.preSelectedProductIds).then((selected) => {
        if (selected.length > 0) {
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

  const fuzzyOrders = useFuzzySearch(orders, tabState.searchQuery, { keys: ['supplierName', 'id'] });
  const fuzzySuppliers = useFuzzySearch(suppliers, tabState.searchQuery, { keys: ['name'] });

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
        message: storeError || 'No se pudo eliminar el proveedor. Verifica tu conexión e intenta de nuevo.',
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
    const ok = await cancelOrder(confirmCancelOrder.id, tenantId);
    if (ok) {
      addToast({ type: 'success', message: 'Orden cancelada.', duration: 3000 });
    } else {
      addToast({ type: 'error', message: storeError || 'No se pudo cancelar la orden.', duration: 5000 });
    }
    setConfirmCancelOrder(null);
  };

  const handleConfirmDeleteOrder = async () => {
    if (!confirmDeleteOrder || !tenantId) return;
    const ok = await softDeleteOrder(confirmDeleteOrder.id, tenantId);
    if (ok) {
      addToast({ type: 'success', message: 'Orden eliminada.', duration: 3000 });
    } else {
      addToast({ type: 'error', message: storeError || 'No se pudo eliminar la orden.', duration: 5000 });
    }
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
    return <EmptyState icon={<ShoppingCart size={48} />} title="Selecciona un negocio" description="Elige o crea un negocio para empezar a usar Compras." />;
  }

  const draftCount = orders.filter((o) => o.status === 'draft').length;
  const confirmedCount = orders.filter((o) => o.status === 'confirmed').length;
  const receivedCount = orders.filter((o) => o.status === 'received').length;

  return (
    <div className="p-3 sm:p-6 pb-24 sm:pb-6 max-w-6xl mx-auto space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-linear-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
            <ShoppingCart size={18} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-title font-bold truncate" style={{ fontSize: 'var(--text-fluid-xl)' }}>Compras</h1>
            <p className="text-xs text-text-secondary hidden sm:block">Gestiona órdenes y proveedores</p>
          </div>
        </div>
        {isOwner && canCreate && (
          <Button variant="primary" size="sm" onClick={activeTab === 'ordenes' ? openNewOrder : openNewSupplier} disabled={!isOnline} title={!isOnline ? 'Necesitas internet para esta acción' : undefined}>
            <Plus size={16} />
            <span className="hidden sm:inline">{activeTab === 'ordenes' ? 'Nueva orden' : 'Nuevo proveedor'}</span>
          </Button>
        )}
      </div>

      {/* Desktop tabs */}
      <div className="hidden sm:flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/60 p-1 sticky top-0 z-10 shadow-sm">
        <button
          type="button"
          className={cn(
            'relative flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200',
            activeTab === 'ordenes'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50'
          )}
          onClick={() => handleTabChange('ordenes')}
        >
          <ShoppingCart size={18} />
          Órdenes
          {pendingOrdersCount > 0 && (
            <span className={cn(
              'ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center',
              activeTab === 'ordenes' ? 'bg-white/25 text-white' : 'bg-primary/10 text-primary'
            )}>
              {pendingOrdersCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className={cn(
            'relative flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200',
            activeTab === 'proveedores'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50'
          )}
          onClick={() => handleTabChange('proveedores')}
        >
          <Truck size={18} />
          Proveedores
          {suppliers.length > 0 && (
            <span className={cn(
              'ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center',
              activeTab === 'proveedores' ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-600'
            )}>
              {suppliers.length}
            </span>
          )}
        </button>
      </div>

      {/* Quick stats bar - desktop only */}
      {activeTab === 'ordenes' && orders.length > 0 && (
        <div className="hidden sm:flex items-center gap-3 text-xs">
          {draftCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-amber-700 font-medium">{draftCount} borrador{draftCount !== 1 ? 'es' : ''}</span>
            </div>
          )}
          {confirmedCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-blue-700 font-medium">{confirmedCount} confirmada{confirmedCount !== 1 ? 's' : ''}</span>
            </div>
          )}
          {receivedCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-green-700 font-medium">{receivedCount} recibida{receivedCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

      <Card>
        {activeTab === 'ordenes' && (
          <div key="ordenes" className="p-4 space-y-4 animate-fade-in">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => handleStatusFilter(opt.value, e.currentTarget)}
                  className={cn(
                    'shrink-0 px-3 py-1.5 min-h-11 rounded-full text-xs font-medium border transition-all duration-200 whitespace-nowrap active:scale-[0.98]',
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
                  maxLength={20}
                  placeholder="Buscar orden..."
                  value={tabState.searchQuery}
                  onChange={(e) => saveTabState(activeTab, { searchQuery: e.target.value })}
                  onClear={() => saveTabState(activeTab, { searchQuery: '' })}
                />
              </div>
              <div className="w-full sm:w-48">
                <DatePicker
                  value={tabState.dateFilter}
                  onChange={(e) => {
                    const v = e.target.value;
                    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
                    saveTabState(activeTab, { dateFilter: v > today ? today : v });
                  }}
                  formatHint="dd/mm/aaaa"
                />
              </div>
              {tabState.dateFilter && (
                <button
                  type="button"
                  onClick={() => saveTabState(activeTab, { dateFilter: '' })}
                  className="text-xs text-primary font-medium px-3 py-2 min-h-11 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors shrink-0"
                >
                  Limpiar
                </button>
              )}
            </div>
            <OrderList
              orders={fuzzyOrders.filter((o) => {
                const matchStatus = tabState.statusFilter === 'all' || o.status === tabState.statusFilter;
                if (!tabState.dateFilter) return matchStatus;
                const orderDate = o.createdAt.slice(0, 10);
                return matchStatus && orderDate === tabState.dateFilter;
              })}
              loading={loading}
              isOwner={isOwner}
              isOnline={isOnline}
              onConfirm={confirmOrder}
              onReceive={async (id, items) => {
                if (!tenantId || !userId) return false;
                const ok = await receiveOrder(id, { orderId: id, items }, tenantId, userId);
                if (ok) {
                  addToast({ type: 'success', message: 'Mercancía recibida correctamente.', duration: 3000 });
                } else {
                  addToast({ type: 'error', message: storeError || 'Error al recibir la mercancía.', duration: 5000 });
                }
                return ok;
              }}
              onCancel={(id) => {
                const order = orders.find((o) => o.id === id);
                setConfirmCancelOrder({ id, name: order?.supplierName ?? '' });
              }}
              onEdit={handleEditOrder}
              onDeleteOrder={(id, name) => setConfirmDeleteOrder({ id, name })}
              onPayOrder={(order) => setPayOrder(order)}
              onRefresh={refresh}
              tenantId={tenantId}
            />
          </div>
        )}

        {activeTab === 'proveedores' && (
          <div key="proveedores" className="p-4 space-y-4 animate-fade-in">
            <SearchInput
              maxLength={20}
              placeholder="Buscar proveedor..."
              value={tabState.searchQuery}
              onChange={(e) => saveTabState(activeTab, { searchQuery: e.target.value })}
              onClear={() => saveTabState(activeTab, { searchQuery: '' })}
            />
            <SupplierList
              suppliers={fuzzySuppliers}
              loading={loading}
              isOwner={isOwner}
              tenantId={tenantId}
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
    <div className="space-y-4 animate-slide-down">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center shrink-0 ring-1 ring-danger/20">
          <AlertTriangle size={24} className="text-danger" />
        </div>
        <div className="pt-1">
          <p className="text-sm font-semibold text-gray-900">¿Eliminar proveedor {confirmDeleteSupplier.name}?</p>
          <p className="text-xs text-gray-500 mt-1">El proveedor se borrará definitivamente. Esta acción no se puede deshacer.</p>
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
    <div className="space-y-4 animate-slide-down">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center shrink-0 ring-1 ring-danger/20">
          <AlertTriangle size={24} className="text-danger" />
        </div>
        <div className="pt-1">
          <p className="text-sm font-semibold text-gray-900">¿Cancelar orden de {confirmCancelOrder.name}?</p>
          <p className="text-xs text-gray-500 mt-1">La orden quedará marcada como cancelada y no podrá recibirse.</p>
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
    <div className="space-y-4 animate-slide-down">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center shrink-0 ring-1 ring-danger/20">
          <AlertTriangle size={24} className="text-danger" />
        </div>
        <div className="pt-1">
          <p className="text-sm font-semibold text-gray-900">¿Eliminar orden de {confirmDeleteOrder.name}?</p>
          <p className="text-xs text-gray-500 mt-1">La orden se ocultará de la lista. Esta acción no se puede deshacer.</p>
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

{payOrder && tenantId && (
  <PaySupplierModal
    supplierId={payOrder.supplierId}
    isOpen={!!payOrder}
    onClose={() => setPayOrder(null)}
    onSuccess={() => { setPayOrder(null); refresh(); }}
    tenantId={tenantId}
  />
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
