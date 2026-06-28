import { useState, useMemo, useEffect } from 'react';
import { Users, History as HistoryIcon, Plus, AlertTriangle, ShoppingBag, TrendingUp } from 'lucide-react';
import { Button, Card, EmptyState, SearchInput, BottomNav, type BottomNavItem, Modal, ModuleOnboarding } from '../../../common/components';
import { cn } from '../../../lib/utils';
import { useFuzzySearch } from '../../../lib/useFuzzySearch';
import { useCustomers } from '../hooks/useCustomers';
import { useCustomerStore } from '../stores/customerStore';
import { useToastStore } from '../../../stores/toastStore';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { customerService } from '../services/customerService';
import { CustomerList } from './CustomerList';
import { CustomerForm } from './CustomerForm';
import { CustomerDetailModal } from './CustomerDetailModal';
import { GlobalHistoryView } from './GlobalHistoryView';
import type { Customer } from '../../../specs/customers';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { handleServiceError } from '../../../common/utils/handleServiceError';
import { createAppError, type Result } from '@logiscore/core';

type TabKey = 'clientes' | 'historial-global';

interface CustomersPageProps {
  tenantId: string | null;
}

export function CustomersPage({ tenantId }: CustomersPageProps) {
  const {
    customers, loading,
    history, historyLoading,
    createCustomer, updateCustomer, deleteCustomer, fetchCustomers, fetchHistory,
    role, reset,
  } = useCustomers(tenantId);
  const { addToast } = useToastStore();
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<TabKey>('clientes');
  const [searchQuery, setSearchQuery] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ranking, setRanking] = useState<Array<{ customerId: string; customerName: string; totalSpentUsd: number; totalSpentBs: number; purchaseCount: number; averageTicketUsd: number }>>([]);
  const [rankingLoading, setRankingLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (activeTab === 'historial-global' && tenantId) {
      // PLAN-112 (C1): customerId undefined = historial global (todas las ventas con cliente del tenant)
      // PLAN-112 (NEW-1): wirear DatePickers a la query. Zod .datetime() exige ISO 8601 con tiempo.
      const dateFrom = startDate ? `${startDate}T00:00:00.000Z` : undefined;
      const dateTo = endDate ? `${endDate}T23:59:59.999Z` : undefined;
      fetchHistory({ limit: 50, offset: 0, dateFrom, dateTo });
      setRankingLoading(true);
      customerService.getCustomersRanking(tenantId, 5).then((res) => {
        if (res.ok) setRanking(res.data);
        setRankingLoading(false);
      });
    }
  }, [activeTab, tenantId, fetchHistory, startDate, endDate]);

  useEffect(() => {
    return () => reset();
  }, [reset]);

  const session = useAuthStore((s) => s.session);
  const canCreate = hasActionPermission(session, 'customers', 'create');
  const canUpdate = hasActionPermission(session, 'customers', 'update');
  const isOwner = role === 'owner' || role === 'admin';
  const fuzzyCustomers = useFuzzySearch(customers, searchQuery, { keys: ['name', 'phone'] });

  const handleSubmit = async (data: Parameters<typeof createCustomer>[0]) => {
    if (!tenantId) return false;
    if (editCustomer) {
      const ok = await updateCustomer(editCustomer.id, data);
      return ok;
    }
    const newId = await createCustomer(data);
    return !!newId;
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const ok = await deleteCustomer(confirmDelete.id);
    if (ok) {
      addToast({ type: 'success', message: 'Cliente eliminado.', duration: 3000 });
    } else {
      const storeError = useCustomerStore.getState().error;
      const errResult: Result<null> = { ok: false, error: createAppError({ code: 'CUSTOMER_DELETE_FAILED', message: storeError || 'No se pudo eliminar el cliente. Verifica tu conexión e intenta de nuevo.' }) };
      handleServiceError(errResult);
    }
    setConfirmDelete(null);
  };

  const bottomNavItems: BottomNavItem[] = useMemo(
    () => [
      {
        id: 'clientes',
        label: 'Clientes',
        icon: <Users size={20} />,
        onClick: () => setActiveTab('clientes'),
      },
      {
        id: 'historial-global',
        label: 'Historial',
        icon: <HistoryIcon size={20} />,
        onClick: () => setActiveTab('historial-global'),
      },
    ],
    [],
  );

  if (!tenantId) {
    return <EmptyState icon={<Users size={48} />} title="Selecciona un negocio" description="Elige o crea un negocio para empezar a usar Clientes." />;
  }

  return (
    <div className="p-3 sm:p-6 pb-20 sm:pb-6 max-w-6xl mx-auto space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between gap-2 bg-linear-to-br from-primary/5 via-transparent to-accent/5 p-4 rounded-2xl animate-fade-in border border-primary/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-linear-to-br from-primary to-primary-dark flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
            <Users size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-title font-bold truncate" style={{ fontSize: 'var(--text-fluid-xl)' }}>Clientes</h1>
            <p className="text-xs text-text-secondary hidden sm:block">Gestiona tus clientes y su historial de compras</p>
          </div>
        </div>
        {canCreate && activeTab === 'clientes' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setEditCustomer(null); setShowForm(true); }}
            disabled={!isOnline}
            title={!isOnline ? 'Necesitas internet para crear un cliente' : undefined}
            className="min-h-11 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-shadow"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nuevo cliente</span>
          </Button>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/60 p-1 sticky top-0 z-10 shadow-sm">
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200',
            activeTab === 'clientes' ? 'bg-primary text-white shadow-md shadow-primary/20 customer-tab-active' : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50',
          )}
          onClick={() => setActiveTab('clientes')}
        >
          <Users size={18} />
          Clientes
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200',
            activeTab === 'historial-global' ? 'bg-primary text-white shadow-md shadow-primary/20 customer-tab-active' : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50',
          )}
          onClick={() => setActiveTab('historial-global')}
        >
          <HistoryIcon size={18} />
          Historial global
        </button>
      </div>

      <Card>
        {activeTab === 'clientes' && (
          <div key="clientes" className="p-4 space-y-4 animate-fade-in">
            <SearchInput
              maxLength={20}
              placeholder="Buscar cliente por nombre o teléfono..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery('')}
            />
            <CustomerList
              customers={fuzzyCustomers}
              loading={loading}
              isOwner={isOwner}
              onEdit={(c) => { setEditCustomer(c); setShowForm(true); }}
              onDelete={(id, name) => setConfirmDelete({ id, name })}
              onViewHistory={(c) => setViewCustomer(c)}
            />
          </div>
        )}

        {activeTab === 'historial-global' && (
          <div key="historial-global" className="p-4 space-y-4 animate-fade-in">
            <GlobalHistoryView
              tenantId={tenantId}
              startDate={startDate}
              endDate={endDate}
              setStartDate={setStartDate}
              setEndDate={setEndDate}
              searchQuery={globalSearch}
              setSearchQuery={setGlobalSearch}
              sales={history}
              loading={historyLoading}
              customers={customers}
              ranking={ranking}
              rankingLoading={rankingLoading}
            />
          </div>
        )}
      </Card>

      <BottomNav items={bottomNavItems} activeId={activeTab} className="sm:hidden" />

      {showForm && (
        <CustomerForm
          isOpen={showForm}
          onClose={() => { setShowForm(false); setEditCustomer(null); }}
          onSubmit={handleSubmit}
          editCustomer={editCustomer}
        />
      )}

      <CustomerDetailModal
        customer={viewCustomer}
        isOpen={!!viewCustomer}
        tenantId={tenantId}
        onClose={() => setViewCustomer(null)}
        onEdit={canUpdate ? (c) => { setViewCustomer(null); setEditCustomer(c); setShowForm(true); } : undefined}
        onRefresh={async () => {
          await fetchCustomers(tenantId, true);
          if (viewCustomer) {
            const updated = useCustomerStore.getState().customers.find(c => c.id === viewCustomer.id);
            if (updated) setViewCustomer(updated);
          }
        }}
      />

      {confirmDelete && (
        <Modal isOpen={true} onClose={() => setConfirmDelete(null)} title="Confirmar eliminación">
          <div className="space-y-4 animate-slide-down">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center shrink-0 ring-1 ring-danger/20">
                <AlertTriangle size={24} className="text-danger" />
              </div>
              <div className="pt-1">
                <p className="text-sm font-semibold text-gray-900">¿Eliminar cliente {confirmDelete.name}?</p>
                <p className="text-xs text-gray-500 mt-1">
                  Se marcará como inactivo. Si tiene ventas registradas, permanecerá en el historial.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setConfirmDelete(null)}>
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={handleDelete} disabled={!isOnline}>
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ModuleOnboarding
        moduleId="customers"
        steps={[
          {
            title: 'Gestiona tus Clientes',
            description: 'Aquí registras a tus clientes frecuentes. Podrás asociarlos a ventas y ver su historial de compras.',
            icon: <Users size={24} className="text-white" />,
          },
          {
            title: 'Asignar a una Venta',
            description: 'En el POS, antes de cobrar, toca "Asignar cliente" para vincular la venta. Así verás su historial.',
            icon: <ShoppingBag size={24} className="text-white" />,
          },
          {
            title: 'Historial de Compras',
            description: 'Toca el ícono de historial en cualquier cliente para ver cuánto ha gastado, cuándo fue su última compra y más.',
            icon: <TrendingUp size={24} className="text-white" />,
          },
        ]}
        onComplete={() => {}}
      />
    </div>
  );
}


