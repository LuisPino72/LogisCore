import { useState, useMemo, useEffect } from 'react';
import { Users, History as HistoryIcon, Plus, AlertTriangle, ShoppingBag, Calendar, TrendingUp } from 'lucide-react';
import { Button, Card, EmptyState, SearchInput, BottomNav, type BottomNavItem, Modal, ModuleOnboarding, DatePicker } from '../../../common/components';
import { cn } from '../../../lib/utils';
import { useFuzzySearch } from '../../../lib/useFuzzySearch';
import { useCustomers } from '../hooks/useCustomers';
import { useCustomerStore } from '../stores/customerStore';
import { useToastStore } from '../../../stores/toastStore';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { CustomerList } from './CustomerList';
import { CustomerForm } from './CustomerForm';
import { CustomerDetailModal } from './CustomerDetailModal';
import type { Customer } from '../../../specs/customers';
import { formatBs, formatUsd } from '@/lib/formatBs';
import type { Sale } from '../../pos/types';

type TabKey = 'clientes' | 'historial-global';

interface CustomersPageProps {
  tenantId: string | null;
}

export function CustomersPage({ tenantId }: CustomersPageProps) {
  const {
    customers, loading, error,
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
      import('../services/customerService').then(({ customerService }) => {
        customerService.getCustomersRanking(tenantId, 5).then((res) => {
          if (res.ok) setRanking(res.data);
          setRankingLoading(false);
        });
      });
    }
  }, [activeTab, tenantId, fetchHistory, startDate, endDate]);

  useEffect(() => {
    return () => reset();
  }, [reset]);

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
      addToast({ type: 'error', message: error || 'No se pudo eliminar el cliente. Verifica tu conexión e intenta de nuevo.' });
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Users size={18} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-title font-bold truncate" style={{ fontSize: 'var(--text-fluid-xl)' }}>Clientes</h1>
            <p className="text-xs text-text-secondary hidden sm:block">Gestiona tus clientes y su historial de compras</p>
          </div>
        </div>
        {isOwner && activeTab === 'clientes' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setEditCustomer(null); setShowForm(true); }}
            disabled={!isOnline}
            title={!isOnline ? 'Necesitas internet para crear un cliente' : undefined}
            className="min-h-11"
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
            activeTab === 'clientes' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50',
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
            activeTab === 'historial-global' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50',
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
        onEdit={isOwner ? (c) => { setViewCustomer(null); setEditCustomer(c); setShowForm(true); } : undefined}
        onRefresh={async () => {
          await fetchCustomers(tenantId, true);
          if (viewCustomer) {
            const updated = useCustomerStore.getState().customers.find(c => c.id === viewCustomer.id);
            if (updated) setViewCustomer(updated);
          }
        }}
        canEdit={isOwner}
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

interface GlobalHistoryViewProps {
  startDate: string;
  endDate: string;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  sales: Sale[];
  loading: boolean;
  customers: Customer[];
  ranking: Array<{ customerId: string; customerName: string; totalSpentUsd: number; totalSpentBs: number; purchaseCount: number; averageTicketUsd: number }>;
  rankingLoading: boolean;
}

function GlobalHistoryView({
  startDate, endDate, setStartDate, setEndDate,
  searchQuery, setSearchQuery, sales, loading, customers,
  ranking, rankingLoading,
}: GlobalHistoryViewProps) {
  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const filteredSales = useMemo(() => {
    let r = sales;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter((s) => {
        const customer = s.customerId ? customerMap.get(s.customerId) : null;
        return customer?.name.toLowerCase().includes(q);
      });
    }
    return r;
  }, [sales, searchQuery, customerMap]);

  // PLAN-112 (C2): usar subtotalBs (sin IGTF+IVA) para consistencia con DINERO-020
  // y con customerService.getCustomerStats/getCustomersRanking.
  const totalSpentUsd = useMemo(
    () => filteredSales.reduce((sum, s) => sum + (s.exchangeRate > 0 ? s.subtotalBs / s.exchangeRate : 0), 0),
    [filteredSales],
  );

  const uniqueCustomers = useMemo(() => {
    const set = new Set<string>();
    for (const s of filteredSales) {
      if (s.customerId) set.add(s.customerId);
    }
    return set.size;
  }, [filteredSales]);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <SearchInput
            maxLength={20}
            placeholder="Filtrar por nombre de cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
          />
        </div>
        <div className="w-full sm:w-44">
          <DatePicker
            value={startDate}
            onChange={(e) => {
              const v = e.target.value;
              setStartDate(v);
              if (v && endDate && v > endDate) setEndDate(v);
              if (v) {
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
                if (v > today) setStartDate(today);
              }
            }}
            formatHint="desde"
          />
        </div>
        <div className="w-full sm:w-44">
          <DatePicker
            value={endDate}
            onChange={(e) => {
              const v = e.target.value;
              setEndDate(v);
              if (v && startDate && v < startDate) setStartDate(v);
              if (v) {
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
                if (v > today) setEndDate(today);
              }
            }}
            formatHint="hasta"
          />
        </div>
        {(startDate || endDate || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStartDate(''); setEndDate(''); setSearchQuery(''); }}
            className="text-xs min-h-11"
          >
            Limpiar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 to-primary/10 p-3">
          <p className="text-xs text-text-secondary">Ventas con cliente</p>
          <p className="text-lg font-bold text-primary">{filteredSales.length}</p>
        </div>
        <div className="rounded-xl border border-accent/20 bg-linear-to-br from-accent/5 to-accent/10 p-3">
          <p className="text-xs text-text-secondary">Total (Dólares)</p>
          <p className="text-lg font-bold text-accent">{formatUsd(totalSpentUsd)}</p>
        </div>
        <div className="rounded-xl border border-info/20 bg-linear-to-br from-info/5 to-info/10 p-3">
          <p className="text-xs text-text-secondary">Clientes únicos</p>
          <p className="text-lg font-bold text-info">{uniqueCustomers}</p>
        </div>
      </div>

      {ranking.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp size={12} />
            Top 5 clientes
          </h4>
          <div className="space-y-1.5">
            {ranking.map((c, i) => {
              const topSpent = ranking[0]?.totalSpentUsd ?? 1;
              const pct = topSpent > 0 ? Math.round((c.totalSpentUsd / topSpent) * 100) : 0;
              return (
                <div key={c.customerId} className="px-3 py-2 rounded-lg border border-gray-100 bg-white">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-primary w-5 text-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900 min-w-0 flex-1 truncate">{c.customerName}</span>
                  </div>
                  <div className="flex items-center justify-between pl-7 mb-1">
                    <p className="text-xs text-text-secondary">{c.purchaseCount} compras · ticket {formatUsd(c.averageTicketUsd)}</p>
                    <p className="text-sm font-bold text-gray-900 shrink-0">{formatUsd(c.totalSpentUsd)}</p>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full progress-fill"
                      style={{ width: `${pct}%`, background: i === 0 ? 'var(--color-primary)' : 'var(--color-accent)' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
          Historial detallado
        </h4>
        {loading || rankingLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : filteredSales.length === 0 ? (
          <EmptyState
            icon={<Calendar size={32} />}
            title="Sin ventas con clientes asignados"
            description="Las ventas con cliente aparecerán aquí. Asocia clientes a tus ventas en el POS."
          />
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {filteredSales.map((sale) => {
              const customer = sale.customerId ? customerMap.get(sale.customerId) : null;
              return (
                <div
                  key={sale.id}
                  className="px-3 py-2.5 rounded-lg border border-gray-100 bg-white hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 min-w-0 wrap-break-word">
                      {customer?.name ?? 'Cliente eliminado'}
                    </p>
                    <p className="text-sm font-bold text-gray-900 shrink-0">{formatBs(sale.totalBs)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-text-secondary">
                      {new Date(sale.createdAt).toLocaleString('es-VE', {
                        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                      {' · '}
                      {sale.paymentMethod === 'efectivo_bs' ? 'Efectivo Bs' :
                        sale.paymentMethod === 'efectivo_usd' ? 'Efectivo USD' :
                        sale.paymentMethod === 'pago_movil' ? 'Pago Móvil' : 'Tarjeta'}
                    </p>
                    <p className="text-xs text-text-secondary shrink-0">
                      {formatUsd(sale.exchangeRate > 0 ? sale.subtotalBs / sale.exchangeRate : 0)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
