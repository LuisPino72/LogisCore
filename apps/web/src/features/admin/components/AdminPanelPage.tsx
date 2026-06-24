import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminPanel } from '../hooks/useAdminPanel';
import { useTenantFilters } from '../hooks/useTenantFilters';
import { useAuthStore } from '../../auth/stores/authStore';
import { ArrowLeft, Building2, CreditCard, Monitor, Plus, Shield, Store, Tags, UsersRound, UserCog } from 'lucide-react';
import { AppShell, BottomNav, Button, Card, EmptyState, Spinner, LogoutButton } from '../../../common/components';
import './index.css';
import { TenantSection } from './TenantSection';
import { UserSection } from './UserSection';
import { AllUsersSection } from './AllUsersSection';
import { SubscriptionSection } from './SubscriptionSection';
import { GlobalCategorySection } from './GlobalCategorySection';
import { AuditSection } from './AuditSection';
import { RoleSection } from './RoleSection';
import { ActiveSessionsSection } from './ActiveSessionsSection';
import type { Tenant } from '../types';

const ADMIN_PAGE_SIZE = 10;

type Sheet = 'tenants' | 'users' | 'all-users' | 'subscriptions' | 'global-categories' | 'audit' | 'roles' | 'sessions';

const TABS = [
  { id: 'tenants' as Sheet, label: 'Locales', icon: <Building2 size={20} /> },
  { id: 'all-users' as Sheet, label: 'Usuarios', icon: <UsersRound size={20} /> },
  { id: 'subscriptions' as Sheet, label: 'Suscripciones', icon: <CreditCard size={20} /> },
  { id: 'roles' as Sheet, label: 'Roles', icon: <UserCog size={20} /> },
  { id: 'global-categories' as Sheet, label: 'Categorías', icon: <Tags size={20} /> },
  { id: 'sessions' as Sheet, label: 'Sesiones', icon: <Monitor size={20} /> },
  { id: 'audit' as Sheet, label: 'Auditoría', icon: <Shield size={20} /> },
] as const;

export function AdminPanelPage() {
  // Defense-in-depth: AdminRoute en App.tsx ya protege esta ruta,
  // pero verificamos aquí también por seguridad en capas.
  const role = useAuthStore((s) => s.session?.role);
  if (role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const {
    tenants, users, allUsers, subscriptions, globalCategories, analytics, isLoading, error,
    fetchTenants, fetchUsers, fetchAllUsers, fetchSubscriptions, fetchGlobalCategories, fetchAnalytics,
    renewSubscription, createTenant, addEmployee, updateTenant, removeEmployee,
    softDeleteTenant, hardDeleteTenant, restoreTenant, resetPassword,
    createGlobalCategory, updateGlobalCategory, deleteGlobalCategory,
    fetchRoles, roles, updateUserRole,
  } = useAdminPanel();

  const { filters, filteredTenants, setSearch, setStatus, setPlan } = useTenantFilters(tenants);

  const [activeSheet, setActiveSheet] = useState<Sheet>('tenants');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedTenantName, setSelectedTenantName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showCreateGlobalCatModal, setShowCreateGlobalCatModal] = useState(false);
  const [allUserPage, setAllUserPage] = useState(1);

  useEffect(() => { setAllUserPage(1); }, [allUsers.length]);

  const allUserTotalPages = Math.max(1, Math.ceil(allUsers.length / ADMIN_PAGE_SIZE));
  const paginatedAllUsers = allUsers.slice((allUserPage - 1) * ADMIN_PAGE_SIZE, allUserPage * ADMIN_PAGE_SIZE);

  useEffect(() => {
    fetchTenants();
    fetchAllUsers();
    fetchSubscriptions();
    fetchGlobalCategories();
    fetchRoles();
  }, [fetchTenants, fetchAllUsers, fetchSubscriptions, fetchGlobalCategories, fetchRoles]);

  const handleSelectTenant = (tenant: Tenant) => {
    setSelectedTenantId(tenant.id);
    setSelectedTenantName(tenant.name);
    setActiveSheet('users');
    fetchUsers(tenant.id);
  };

  const handleBackToTenants = () => {
    setActiveSheet('tenants');
    setSelectedTenantId(null);
  };

  const topBarActions = () => {
    switch (activeSheet) {
      case 'tenants':
        return (
          <Button variant="primary" size="sm" className="min-h-11" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            <span className="hidden sm:inline">Nuevo Local</span>
          </Button>
        );
      case 'users':
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" className="min-h-11" onClick={handleBackToTenants}>
              <ArrowLeft size={18} />
            </Button>
            <Button variant="primary" size="sm" className="min-h-11" onClick={() => setShowAddEmployeeModal(true)}>
              <Plus size={16} /> Empleado
            </Button>
          </div>
        );
      case 'global-categories':
        return (
          <Button variant="primary" size="sm" className="min-h-11" onClick={() => setShowCreateGlobalCatModal(true)}>
            <Plus size={16} />
            <span className="hidden sm:inline">Nueva Categoría</span>
          </Button>
        );
      default:
        return null;
    }
  };

  if (isLoading && tenants.length === 0) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-gray-600 animate-pulse admin-section-reveal">Cargando panel de administración...</p>
      </div>
    );
  }

  if (error && tenants.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Building2 size={32} className="admin-empty-icon" />}
          title="No se pudieron cargar los datos. Desliza hacia abajo para recargar."
          description={error}
        />
      </Card>
    );
  }

  return (
    <AppShell
      topBar={
        <div className="flex items-center gap-3 px-2 flex-wrap">
          <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-lg admin-header-glow">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <Store size={16} className="text-primary" />
            </div>
            <span className="font-title font-semibold text-sm text-primary">Panel Admin</span>
          </div>
          <div className="flex-1" />
          {topBarActions()}
          <LogoutButton />
        </div>
      }
    >
      <div className="hidden sm:flex items-center gap-1 border-b border-gray-200 bg-white sticky top-0 z-10 max-w-6xl mx-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeSheet === tab.id}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-title font-medium border-b-2 transition-all active:scale-[0.98] ${
              activeSheet === tab.id
                ? 'border-primary text-primary admin-tab-active'
                : 'border-transparent text-text-secondary hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveSheet(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-6 pb-20 sm:pb-6 max-w-6xl mx-auto space-y-4 sm:space-y-6 admin-stagger">
        {activeSheet === 'tenants' && (
          <div className="admin-section-reveal">
            <TenantSection
              tenants={tenants}
              filteredTenants={filteredTenants}
              filters={filters}
              setSearch={setSearch}
              setStatus={setStatus}
              setPlan={setPlan}
              onSelectTenant={handleSelectTenant}
              createTenant={createTenant}
              updateTenant={updateTenant}
              softDeleteTenant={softDeleteTenant}
              hardDeleteTenant={hardDeleteTenant}
              restoreTenant={restoreTenant}
              addEmployee={addEmployee}
              fetchAnalytics={fetchAnalytics}
              analytics={analytics}
              showCreateModal={showCreateModal}
              onCloseCreateModal={() => setShowCreateModal(false)}
              roles={roles}
            />
          </div>
        )}

        {activeSheet === 'users' && (
          <div className="admin-section-reveal">
            <UserSection
              users={users}
              selectedTenantId={selectedTenantId}
              selectedTenantName={selectedTenantName}
              addEmployee={addEmployee}
              removeEmployee={removeEmployee}
              resetPassword={resetPassword}
              updateUserRole={updateUserRole}
              roles={roles}
              showAddEmployeeModal={showAddEmployeeModal}
              onCloseAddEmployeeModal={() => setShowAddEmployeeModal(false)}
            />
          </div>
        )}

        {activeSheet === 'all-users' && (
          <div className="admin-section-reveal">
            <AllUsersSection
              allUsers={paginatedAllUsers}
              page={allUserPage}
              totalPages={allUserTotalPages}
              onPageChange={setAllUserPage}
            />
          </div>
        )}

        {activeSheet === 'subscriptions' && (
          <div className="admin-section-reveal">
            <SubscriptionSection
              subscriptions={subscriptions}
              onRenew={renewSubscription}
            />
          </div>
        )}

        {activeSheet === 'roles' && (
          <div className="admin-section-reveal">
            <RoleSection />
          </div>
        )}

        {activeSheet === 'global-categories' && (
          <div className="admin-section-reveal">
            <GlobalCategorySection
              globalCategories={globalCategories}
              createGlobalCategory={createGlobalCategory}
              updateGlobalCategory={updateGlobalCategory}
              deleteGlobalCategory={deleteGlobalCategory}
              showCreateModal={showCreateGlobalCatModal}
              onCloseCreateModal={() => setShowCreateGlobalCatModal(false)}
            />
          </div>
        )}

        {activeSheet === 'sessions' && (
          <div className="admin-section-reveal">
            <ActiveSessionsSection tenants={tenants} />
          </div>
        )}

        {activeSheet === 'audit' && (
          <div className="admin-section-reveal">
            <AuditSection />
          </div>
        )}
      </div>

      <BottomNav
        activeId={activeSheet}
        items={[
          { id: 'tenants', label: 'Locales', icon: <Building2 size={20} />, onClick: () => setActiveSheet('tenants') },
          { id: 'all-users', label: 'Usuarios', icon: <UsersRound size={20} />, onClick: () => setActiveSheet('all-users') },
          { id: 'subscriptions', label: 'Suscripciones', icon: <CreditCard size={20} />, onClick: () => setActiveSheet('subscriptions') },
          { id: 'roles', label: 'Roles', icon: <UserCog size={20} />, onClick: () => setActiveSheet('roles') },
          { id: 'sessions', label: 'Sesiones', icon: <Monitor size={20} />, onClick: () => setActiveSheet('sessions') },
          { id: 'global-categories', label: 'Categorías', icon: <Tags size={20} />, onClick: () => setActiveSheet('global-categories') },
          { id: 'audit', label: 'Auditoría', icon: <Shield size={20} />, onClick: () => setActiveSheet('audit') },
        ]}
      />
    </AppShell>
  );
}
