import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAdminPanel } from '../hooks/useAdminPanel';
import { useTenantFilters } from '../hooks/useTenantFilters';
import { EventBus, SystemEvents } from '@logiscore/core';
import { CreateTenantWithUsersInputSchema } from '../types';
import type { Tenant, UserRole, GlobalUser, SubscriptionView, GlobalCategory } from '../types';
import type { Column } from '../../../common/components/DataTable';
import {
  Alert,
  AppShell,
  Badge,
  BottomNav,
  Button,
  Card,
  DataTable,
  Dropdown,
  Input,
  Modal,
  SearchInput,
  Select,
  Spinner,
  LogoutButton,
  Tooltip,
} from '../../../common/components';
import { useToastStore } from '../../../stores/toastStore';
import { Store, Building2, UsersRound, ArrowLeft, Plus, Trash2, Eye, Users as UsersIcon, CreditCard, RefreshCw, UserPlus, Shield, RotateCcw, KeyRound, BarChart3, Tags, MoreVertical } from 'lucide-react';
import { AnalyticsModal } from './AnalyticsModal';

interface EmployeeForm {
  email: string;
  password: string;
  name: string;
}

interface CreateForm {
  tenant: { name: string; rif: string; direccion: string; telefono: string };
  owner: { email: string; password: string; name: string };
  employees: EmployeeForm[];
}

interface EditForm {
  name: string;
  rif: string;
  direccion: string;
  telefono: string;
}

const emptyCreateForm: CreateForm = {
  tenant: { name: '', rif: '', direccion: '', telefono: '' },
  owner: { email: '', password: '', name: '' },
  employees: [],
};

type Sheet = 'tenants' | 'users' | 'all-users' | 'subscriptions' | 'global-categories';

function getSubscriptionProgress(daysRemaining: number): { pct: number; color: string } {
  const maxDays = 30;
  const pct = Math.min(Math.max((daysRemaining / maxDays) * 100, 0), 100);
  const color = daysRemaining <= 0 ? 'var(--color-danger)' : daysRemaining <= 3 ? 'var(--color-warning)' : daysRemaining <= 7 ? 'var(--color-accent)' : 'var(--color-success)';
  return { pct, color };
}

export function AdminPanelPage() {
  const {
    tenants, users, allUsers, subscriptions, globalCategories, analytics, isLoading, error,
    fetchTenants, fetchUsers, fetchAllUsers, fetchSubscriptions, fetchGlobalCategories, fetchAnalytics,
    renewSubscription, createTenant, addEmployee, updateTenant, removeEmployee,
    softDeleteTenant, hardDeleteTenant, restoreTenant, resetPassword,
    createGlobalCategory, updateGlobalCategory, deleteGlobalCategory,
  } = useAdminPanel();

  const { filteredTenants, setSearch, setStatus, setPlan } = useTenantFilters(tenants);

  const [activeSheet, setActiveSheet] = useState<Sheet>('tenants');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedTenantName, setSelectedTenantName] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);

  const [renovateTarget, setRenovateTarget] = useState<SubscriptionView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [analyticsTarget, setAnalyticsTarget] = useState<{ id: string; name: string } | null>(null);
  const [showAnalyticsLoading, setShowAnalyticsLoading] = useState(false);

  const [deleteEmployeeTarget, setDeleteEmployeeTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingEmployee, setIsDeletingEmployee] = useState(false);

  const [resetPassTarget, setResetPassTarget] = useState<{ userId: string; email: string; name: string } | null>(null);
  const [showCreateGlobalCatModal, setShowCreateGlobalCatModal] = useState(false);
  const [showEditGlobalCatModal, setShowEditGlobalCatModal] = useState(false);
  const [globalCatNewName, setGlobalCatNewName] = useState('');
  const [globalCatEditId, setGlobalCatEditId] = useState<string | null>(null);
  const [globalCatEditName, setGlobalCatEditName] = useState('');
  const [globalCatDeleteTarget, setGlobalCatDeleteTarget] = useState<GlobalCategory | null>(null);
  const [globalCatConfirmText, setGlobalCatConfirmText] = useState('');
  const [globalCatError, setGlobalCatError] = useState<string | null>(null);
  const [globalCatSubmitting, setGlobalCatSubmitting] = useState(false);
  const [globalCatSearch, setGlobalCatSearch] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetPassError, setResetPassError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', rif: '', direccion: '', telefono: '' });
  const [newEmployee, setNewEmployee] = useState<EmployeeForm>({ email: '', password: '', name: '' });

  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { addToast } = useToastStore();

  const filteredGlobalCategories = useMemo(() => {
    if (!globalCatSearch.trim()) return globalCategories;
    const q = globalCatSearch.toLowerCase();
    return globalCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [globalCategories, globalCatSearch]);

  const handleCloseDeleteModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteConfirmText('');
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setShowCreateModal(false);
    setCreateError(null);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
  }, []);

  const handleCloseAddEmployeeModal = useCallback(() => {
    setShowAddEmployeeModal(false);
    setCreateError(null);
  }, []);

  useEffect(() => {
    fetchTenants();
    fetchAllUsers();
    fetchSubscriptions();
    fetchGlobalCategories();
  }, [fetchTenants, fetchAllUsers, fetchSubscriptions, fetchGlobalCategories]);

  const handleSelectTenant = (tenant: Tenant) => {
    setSelectedTenantId(tenant.id);
    setSelectedTenantName(tenant.name);
    setActiveSheet('users');
    fetchUsers(tenant.id);
  };

  const handleNavigateTenant = (slug: string) => {
    EventBus.emit(SystemEvents.ADMIN_NAVIGATE_TENANT, { tenantSlug: slug });
  };

  const handleBackToTenants = () => {
    setActiveSheet('tenants');
    setSelectedTenantId(null);
  };

  const handleOpenEdit = (tenant: Tenant) => {
    setEditForm({ name: tenant.name, rif: tenant.rif, direccion: tenant.direccion ?? '', telefono: tenant.telefono ?? '' });
    setSelectedTenantId(tenant.id);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTenantId) return;
    setIsSubmitting(true);
    const result = await updateTenant(selectedTenantId, editForm);
    if (!result.ok) {
      setCreateError(result.error.message);
    }
    setIsSubmitting(false);
    setShowEditModal(false);
    setCreateError(null);
  };

  const handleCreateTenant = async () => {
    setCreateError(null);
    const parsed = CreateTenantWithUsersInputSchema.safeParse(createForm);
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setIsSubmitting(true);
    const result = await createTenant(parsed.data);
    if (result.ok) {
      setShowCreateModal(false);
      setCreateForm(emptyCreateForm);
    } else {
      setCreateError(result.error.message);
    }
    setIsSubmitting(false);
  };

  const handleAddEmployee = async () => {
    if (!selectedTenantId) return;
    setCreateError(null);

    if (!newEmployee.email || !newEmployee.password || !newEmployee.name) {
      setCreateError('Todos los campos del empleado son obligatorios');
      return;
    }

    setIsSubmitting(true);
    const result = await addEmployee({ ...newEmployee, tenantId: selectedTenantId });
    if (result.ok) {
      setShowAddEmployeeModal(false);
      setNewEmployee({ email: '', password: '', name: '' });
    } else {
      setCreateError(result.error.message);
    }
    setIsSubmitting(false);
  };

  const handleRemoveEmployee = (userRoleId: string, name: string) => {
    setDeleteEmployeeTarget({ id: userRoleId, name });
  };

  const handleConfirmDeleteEmployee = async () => {
    if (!deleteEmployeeTarget) return;
    setIsDeletingEmployee(true);
    const result = await removeEmployee(deleteEmployeeTarget.id);
    if (result.ok) {
      addToast({ type: 'success', message: 'Empleado eliminado.', duration: 4000 });
    } else {
      addToast({ type: 'error', message: result.error.message, duration: 5000 });
    }
    setIsDeletingEmployee(false);
    setDeleteEmployeeTarget(null);
  };

  const handleDeleteTenant = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const fn = deleteTarget.deletedAt ? hardDeleteTenant : softDeleteTenant;
      const result = await fn(deleteTarget.id);
      if (result.ok) {
        addToast({
          type: 'success',
          message: deleteTarget.deletedAt
            ? 'Local eliminado permanentemente.'
            : 'Local desactivado correctamente.',
          duration: 4000,
        });
      } else {
        addToast({ type: 'error', message: result.error.message, duration: 5000 });
      }
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al eliminar el local',
        duration: 5000,
      });
    }
    setIsDeleting(false);
    setDeleteTarget(null);
    setDeleteConfirmText('');
  };

  const handleAnalytics = async (tenant: Tenant) => {
    setAnalyticsTarget({ id: tenant.id, name: tenant.name });
    setShowAnalyticsLoading(true);
    await fetchAnalytics(tenant.id);
    setShowAnalyticsLoading(false);
  };

  const handleResetPass = (user: UserRole) => {
    setResetPassTarget({
      userId: user.userId,
      email: user.email ?? user.id,
      name: user.name ?? user.email ?? user.id,
    });
    setNewPassword('');
    setResetPassError(null);
  };

  const handleResetPasswordSubmit = async () => {
    if (!resetPassTarget) return;
    if (!newPassword || newPassword.length < 8) {
      setResetPassError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setIsResetting(true);
    setResetPassError(null);
    const result = await resetPassword(resetPassTarget.userId, newPassword);
    if (result.ok) {
      addToast({ type: 'success', message: 'Contraseña restablecida exitosamente.', duration: 4000 });
      setResetPassTarget(null);
    } else {
      setResetPassError(result.error.message);
    }
    setIsResetting(false);
  };

  const addEmployeeRow = () => {
    if (createForm.employees.length >= 3) return;
    setCreateForm((prev) => ({
      ...prev,
      employees: [...prev.employees, { email: '', password: '', name: '' }],
    }));
  };

  const removeEmployeeRow = (index: number) => {
    setCreateForm((prev) => ({
      ...prev,
      employees: prev.employees.filter((_, i) => i !== index),
    }));
  };

  const updateEmployeeRow = (index: number, field: keyof EmployeeForm, value: string) => {
    setCreateForm((prev) => {
      const updated = [...prev.employees];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, employees: updated };
    });
  };

  const tenantColumns: Column<Tenant>[] = [
    { key: 'name', header: 'Nombre' },
    { key: 'rif', header: 'RIF', hideOnMobile: true },
    { key: 'slug', header: 'Slug', hideOnMobile: true },
    { key: 'plan', header: 'Plan' },
    {
      key: 'status',
      header: 'Estado',
      render: (t) => (
        t.deletedAt
          ? <Badge variant="neutral">Inactivo</Badge>
          : <Badge variant="success">Activo</Badge>
      ),
    },
    { key: 'telefono', header: 'Teléfono', render: (t) => t.telefono || '-' },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'overflow-visible px-1',
      render: (t) => (
        <div className="flex flex-row flex-wrap gap-1 items-center">
          <Tooltip content="Ir al local" position="top">
            <Button variant="ghost" size="sm" onClick={() => handleNavigateTenant(t.slug)}>
              <Eye size={16} />
            </Button>
          </Tooltip>
          <Tooltip content="Editar local" position="top">
            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(t)}>
              <span className="hidden sm:inline">Editar</span>
              <span className="sm:hidden">✎</span>
            </Button>
          </Tooltip>
              <Dropdown
                align="left"
                trigger={<Tooltip content="Más opciones" position="left"><MoreVertical size={18} className="text-gray-500 cursor-pointer" /></Tooltip>}
                items={[
              { label: 'Ver usuarios', icon: <UsersIcon size={16} />, onClick: () => handleSelectTenant(t) },
              { label: 'Analíticas', icon: <BarChart3 size={16} />, onClick: () => handleAnalytics(t) },
              ...(t.deletedAt
                ? [
                    { label: 'Reactivar', icon: <RotateCcw size={16} className="text-green-600" />, onClick: () => restoreTenant(t.id) },
                    { label: 'Eliminar permanentemente', icon: <Trash2 size={16} />, onClick: () => setDeleteTarget(t), variant: 'danger' as const },
                  ]
                : [
                    { label: 'Desactivar', icon: <Trash2 size={16} />, onClick: () => setDeleteTarget(t), variant: 'danger' as const },
                  ]
              ),
            ]}
          />
        </div>
      ),
    },
  ];

  const userColumns: Column<UserRole>[] = [
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Rol' },
    { key: 'createdAt', header: 'Creado', hideOnMobile: true },
    {
      key: 'actions',
      header: 'Acciones',
      render: (u) => (
        <div className="flex gap-1 items-center">
          {u.role === 'owner' && <Badge variant="info">Propietario</Badge>}
          <Tooltip content="Restablecer contraseña" position="top">
            <Button variant="ghost" size="sm" onClick={() => handleResetPass(u)}>
              <KeyRound size={16} />
            </Button>
          </Tooltip>
          {u.role !== 'owner' && (
            <Tooltip content="Eliminar empleado" position="top">
              <Button variant="danger" size="sm" onClick={() => handleRemoveEmployee(u.id, u.name)}>
                <Trash2 size={16} />
              </Button>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  if (isLoading && tenants.length === 0) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-gray-400 animate-pulse">Cargando panel de administración...</p>
      </div>
    );
  }

  if (error && tenants.length === 0) {
    return (
      <div className="min-h-screen bg-surface p-8 flex items-center justify-center">
        <Card className="max-w-md text-center">
          <p className="text-danger text-sm">{error}</p>
          <Button variant="primary" fullWidth className="mt-4" onClick={fetchTenants}>
            Reintentar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <AppShell
      topBar={
        <div className="flex items-center gap-3 px-2">
          <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-lg">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <Store size={16} className="text-primary" />
            </div>
            <span className="font-title font-semibold text-sm text-primary">Panel Admin</span>
          </div>
          <div className="flex-1" />
          {activeSheet === 'tenants' ? (
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              <span className="hidden sm:inline">Nuevo Local</span>
            </Button>
          ) : activeSheet === 'users' ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleBackToTenants}>
                <ArrowLeft size={18} />
              </Button>
              <Button variant="primary" size="sm" onClick={() => setShowAddEmployeeModal(true)}>
                <Plus size={16} /> Empleado
              </Button>
            </div>
          ) : activeSheet === 'global-categories' ? (
            <Button variant="primary" size="sm" onClick={() => { setGlobalCatNewName(''); setGlobalCatError(null); setShowCreateGlobalCatModal(true); }}>
              <Plus size={16} />
              <span className="hidden sm:inline">Nueva Categoría</span>
            </Button>
          ) : null}
          <LogoutButton />
        </div>
      }
    >
      {/* Desktop tabs */}
      <div className="hidden sm:flex items-center gap-1 border-b border-gray-200 bg-white sticky top-14 z-10 max-w-6xl mx-auto">
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-sm font-title font-medium border-b-2 transition-colors ${
            activeSheet === 'tenants'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-gray-700'
          }`}
          onClick={() => setActiveSheet('tenants')}
        >
          <Building2 size={20} />
          Locales
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-sm font-title font-medium border-b-2 transition-colors ${
            activeSheet === 'all-users'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-gray-700'
          }`}
          onClick={() => setActiveSheet('all-users')}
        >
          <UsersRound size={20} />
          Usuarios
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-sm font-title font-medium border-b-2 transition-colors ${
            activeSheet === 'subscriptions'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-gray-700'
          }`}
          onClick={() => setActiveSheet('subscriptions')}
        >
          <CreditCard size={20} />
          Suscripciones
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-3 text-sm font-title font-medium border-b-2 transition-colors ${
            activeSheet === 'global-categories'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-gray-700'
          }`}
          onClick={() => setActiveSheet('global-categories')}
        >
          <Tags size={20} />
          Categorías
        </button>
      </div>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {activeSheet === 'tenants' && (
          <Card>
            <div className="p-4 pb-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-title font-bold text-gray-900">Locales</h2>
                  <p className="text-xs text-text-secondary">{tenants.length} local{tenants.length !== 1 ? 'es' : ''}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <SearchInput
                  placeholder="Buscar local..."
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 min-w-50"
                />
                <Select
                  value=""
                  onChange={(e) => setStatus(e.target.value as 'all' | 'active' | 'inactive')}
                  className="w-32.5"
                >
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </Select>
                <Select
                  value=""
                  onChange={(e) => setPlan(e.target.value)}
                  className="w-32.5"
                >
                  <option value="all">Todos</option>
                  <option value="basico">Básico</option>
                  <option value="plus">Plus</option>
                  <option value="premium">Premium</option>
                </Select>
              </div>
            </div>
            <div className="p-4 pt-0">
              <DataTable
                columns={tenantColumns}
                data={filteredTenants}
                emptyMessage="No hay locales que coincidan con los filtros."
                keyExtractor={(t: Tenant) => t.id}
                renderCardOnMobile
              />
            </div>
          </Card>
        )}

        {activeSheet === 'users' && (
          <Card>
            <div className="p-4 pb-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <UsersIcon size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-title font-bold text-gray-900">Usuarios</h2>
                  <p className="text-xs text-text-secondary">{selectedTenantName} — {users.length} usuario{users.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
            <div className="p-4 pt-0">
              <DataTable
                columns={userColumns}
                data={users}
                emptyMessage="No hay usuarios en este local."
                keyExtractor={(u: UserRole) => u.id}
                renderCardOnMobile
              />
            </div>
          </Card>
        )}

        {activeSheet === 'all-users' && (
          <Card>
            <div className="p-4 pb-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <UsersRound size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-title font-bold text-gray-900">Todos los Usuarios</h2>
                  <p className="text-xs text-text-secondary">{allUsers.length} usuario{allUsers.length !== 1 ? 's' : ''} registrados</p>
                </div>
              </div>
            </div>
            <div className="p-4 pt-0">
              <DataTable
                columns={[
                  { key: 'email', header: 'Email', render: (u: GlobalUser) => (
                    <span className="truncate block" title={u.email}>{u.email}</span>
                  )},
                  { key: 'name', header: 'Nombre' },
                  { key: 'role', header: 'Rol' },
                  { key: 'tenantName', header: 'Local' },
                ]}
                data={allUsers}
                emptyMessage="No hay usuarios registrados."
                keyExtractor={(u: GlobalUser) => u.id}
                renderCardOnMobile
              />
            </div>
          </Card>
        )}

        {activeSheet === 'subscriptions' && (
          <Card>
            <div className="p-4 pb-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <CreditCard size={20} className="text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-title font-bold text-gray-900">Suscripciones</h2>
                  <p className="text-xs text-text-secondary">{subscriptions.length} local{subscriptions.length !== 1 ? 'es' : ''}</p>
                </div>
              </div>
            </div>
            <div className="p-4 pt-0">
              <DataTable
                columns={[
                  { key: 'tenantName', header: 'Local' },
                  {
                    key: 'plan',
                    header: 'Plan',
                    hideOnMobile: true,
                    render: (s: SubscriptionView) => (
                      <Badge variant="info">{s.plan}</Badge>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Estado',
                    render: (s: SubscriptionView) => {
                      const variant = s.status === 'active'
                        ? (s.daysRemaining <= 3 ? 'warning' : 'success')
                        : 'danger';
                      return <Badge variant={variant}>{s.status === 'active' ? 'Activa' : 'Vencida'}</Badge>;
                    },
                  },
                  {
                    key: 'expiresAt',
                    header: 'Vence',
                    render: (s: SubscriptionView) => {
                      if (!s.expiresAt) return <span className="text-gray-400">-</span>;
                      const date = new Date(s.expiresAt).toLocaleDateString('es-ES');
                      const { pct, color } = getSubscriptionProgress(s.daysRemaining);
                      return (
                        <div className="space-y-1 min-w-25">
                          <span className={`text-xs ${s.daysRemaining <= 0 ? 'text-danger font-bold' : s.daysRemaining <= 3 ? 'text-warning font-bold' : s.daysRemaining <= 7 ? 'text-orange-600' : 'text-gray-700'}`}>
                            {date} {s.daysRemaining <= 0 ? '(Vencido)' : `(${s.daysRemaining}d)`}
                          </span>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    key: 'actions',
                    header: 'Acción',
                    render: (s: SubscriptionView) => {
                      const canRenew = s.daysRemaining <= 0;
                      return (
                        <Button
                          variant={canRenew ? 'primary' : 'ghost'}
                          size="sm"
                          disabled={!canRenew}
                          onClick={() => setRenovateTarget(s)}
                        >
                          <RefreshCw size={14} />
                          <span className="hidden sm:inline">{canRenew ? 'Renovar +30d' : 'Activa'}</span>
                        </Button>
                      );
                    },
                  },
                ]}
                data={subscriptions}
                emptyMessage="No hay suscripciones registradas."
                keyExtractor={(s: SubscriptionView) => s.tenantId}
                renderCardOnMobile
              />
            </div>
          </Card>
        )}

        {activeSheet === 'global-categories' && (
          <Card>
            <div className="p-4 pb-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Tags size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-title font-bold text-gray-900">Categorías Globales</h2>
                  <p className="text-xs text-text-secondary">{globalCategories.length} categoría{globalCategories.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <SearchInput
                placeholder="Buscar categoría..."
                value={globalCatSearch}
                onChange={(e) => setGlobalCatSearch(e.target.value)}
                className="mb-4"
              />
            </div>
            <div className="p-4 pt-0">
              {/* Desktop table */}
              <div className="hidden sm:block">
                <DataTable
                  columns={[
                    { key: 'name', header: 'Nombre' },
                    {
                      key: 'createdAt',
                      header: 'Creado',
                      render: (c: GlobalCategory) => new Date(c.createdAt).toLocaleDateString('es-ES'),
                    },
                    {
                      key: 'actions',
                      header: 'Acciones',
                      render: (c: GlobalCategory) => (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setGlobalCatEditId(c.id); setGlobalCatEditName(c.name); setGlobalCatError(null); setShowEditGlobalCatModal(true); }}>
                            <span className="hidden sm:inline">Editar</span>
                            <span className="sm:hidden">✎</span>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setGlobalCatDeleteTarget(c); setGlobalCatConfirmText(''); }}>
                            <Trash2 size={16} className="text-gray-400 hover:text-danger" />
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                  data={filteredGlobalCategories}
                  emptyMessage={globalCatSearch ? 'No se encontraron categorías con ese nombre.' : 'No hay categorías globales definidas. Crea la primera para que esté disponible en todos los nuevos locales.'}
                  keyExtractor={(c: GlobalCategory) => c.id}
                />
              </div>
              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {filteredGlobalCategories.length === 0 ? (
                  <p className="text-center text-sm text-text-secondary py-8">{globalCatSearch ? 'No se encontraron categorías con ese nombre.' : 'No hay categorías globales definidas.'}</p>
                ) : (
                  filteredGlobalCategories.map((c) => (
                    <div key={c.id} className="flex flex-col gap-2 px-3 py-3 rounded-lg border border-gray-100 bg-white">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                        <p className="text-xs text-text-secondary">{new Date(c.createdAt).toLocaleDateString('es-ES')}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" fullWidth onClick={() => { setGlobalCatEditId(c.id); setGlobalCatEditName(c.name); setGlobalCatError(null); setShowEditGlobalCatModal(true); }}>
                          <span className="hidden sm:inline">Editar</span>
                          <span className="sm:hidden">✎</span>
                        </Button>
                        <Button variant="ghost" size="sm" fullWidth onClick={() => { setGlobalCatDeleteTarget(c); setGlobalCatConfirmText(''); }}>
                          <Trash2 size={16} className="text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeId={activeSheet}
        items={[
          { id: 'tenants', label: 'Locales', icon: <Building2 size={20} />, onClick: () => setActiveSheet('tenants') },
          { id: 'all-users', label: 'Usuarios', icon: <UsersRound size={20} />, onClick: () => setActiveSheet('all-users') },
          { id: 'subscriptions', label: 'Suscripciones', icon: <CreditCard size={20} />, onClick: () => setActiveSheet('subscriptions') },
          { id: 'global-categories', label: 'Categorías', icon: <Tags size={20} />, onClick: () => setActiveSheet('global-categories') },
        ]}
      />

      <Modal
        isOpen={showCreateModal}
        onClose={handleCloseCreateModal}
        title="Crear nuevo local"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Tenant section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 size={16} className="text-primary" />
              </div>
              <p className="text-sm font-semibold text-gray-700">Datos del Tenant</p>
            </div>
            <Input
              placeholder="Nombre"
              value={createForm.tenant.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, name: e.target.value } }))}
              validation={{ required: true, maxLength: 30 }}
            />
            <Input
              placeholder="RIF (J-123456789)"
              value={createForm.tenant.rif}
              onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, rif: e.target.value.toUpperCase() } }))}
              validation={{ required: true, pattern: /^[VJEGP]\d{9}$/ }}
            />
            <Input
              placeholder="Teléfono (04121234567)"
              value={createForm.tenant.telefono}
              onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, telefono: e.target.value } }))}
              validation={{ pattern: /^(\+58|0)\d{10}$/ }}
            />
            <Input
              placeholder="Dirección"
              value={createForm.tenant.direccion}
              onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, direccion: e.target.value } }))}
              validation={{ maxLength: 30 }}
            />
          </div>

          {/* Owner section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Shield size={16} className="text-accent" />
              </div>
              <p className="text-sm font-semibold text-gray-700">Propietario (obligatorio)</p>
            </div>
            <Input
              placeholder="Nombre del owner"
              value={createForm.owner.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, name: e.target.value } }))}
              validation={{ required: true, maxLength: 25 }}
            />
            <Input
              placeholder="Email del owner"
              type="email"
              value={createForm.owner.email}
              onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, email: e.target.value } }))}
              validation={{ required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }}
            />
            <Input
              placeholder="Contraseña"
              type="password"
              showPassword
              value={createForm.owner.password}
              onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, password: e.target.value } }))}
              validation={{ required: true, minLength: 8, maxLength: 14 }}
            />
          </div>

          {/* Employees section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <UserPlus size={16} className="text-blue-600" />
                </div>
                <p className="text-sm font-semibold text-gray-700">Empleados (opcional, max 3)</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={addEmployeeRow}
                disabled={createForm.employees.length >= 3}
              >
                <Plus size={16} /> Agregar
              </Button>
            </div>
            {createForm.employees.map((emp, i) => (
              <div key={i} className="rounded-lg bg-surface-alt border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">Empleado #{i + 1}</span>
                  <Button variant="danger" size="sm" onClick={() => removeEmployeeRow(i)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
                <Input
                  placeholder="Nombre"
                  value={emp.name}
                  onChange={(e) => updateEmployeeRow(i, 'name', e.target.value)}
                  validation={{ maxLength: 25 }}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={emp.email}
                  onChange={(e) => updateEmployeeRow(i, 'email', e.target.value)}
                  validation={{ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }}
                />
                <Input
                  placeholder="Contraseña"
                  type="password"
                  showPassword
                  value={emp.password}
                  onChange={(e) => updateEmployeeRow(i, 'password', e.target.value)}
                  validation={{ minLength: 8, maxLength: 14 }}
                />
              </div>
            ))}
          </div>

          {createError && <p className="text-danger text-sm">{createError}</p>}

          <div className="flex gap-2 pt-2">
            <Button
              variant="primary"
              fullWidth
              onClick={handleCreateTenant}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creando...' : 'Crear Tenant'}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={handleCloseEditModal}
        title="Editar local"
      >
        <div className="space-y-4">
          <Input
            placeholder="Nombre"
            value={editForm.name}
            onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
            validation={{ required: true, maxLength: 30 }}
          />
          <Input
            placeholder="RIF"
            value={editForm.rif}
            onChange={(e) => setEditForm((p) => ({ ...p, rif: e.target.value.toUpperCase() }))}
            validation={{ required: true, pattern: /^[VJEGP]\d{9}$/ }}
          />
          <Input
            placeholder="Teléfono (04121234567)"
            value={editForm.telefono}
            onChange={(e) => setEditForm((p) => ({ ...p, telefono: e.target.value }))}
            validation={{ pattern: /^(\+58|0)\d{10}$/ }}
          />
          <Input
            placeholder="Dirección"
            value={editForm.direccion}
            onChange={(e) => setEditForm((p) => ({ ...p, direccion: e.target.value }))}
            validation={{ maxLength: 30 }}
          />
          <div className="border-t border-gray-100 pt-3">
            <Button variant="secondary" fullWidth onClick={() => { setShowAddEmployeeModal(true); setShowEditModal(false); }}>
              <UserPlus size={16} /> Agregar empleado
            </Button>
          </div>
          {createError && <p className="text-danger text-sm">{createError}</p>}
          <div className="flex gap-2">
            <Button variant="primary" fullWidth onClick={handleSaveEdit} disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showAddEmployeeModal}
        onClose={handleCloseAddEmployeeModal}
        title={`Agregar empleado a ${selectedTenantName}`}
      >
        <div className="space-y-4">
          <Input
            placeholder="Nombre"
            value={newEmployee.name}
            onChange={(e) => setNewEmployee((p) => ({ ...p, name: e.target.value }))}
            validation={{ required: true, maxLength: 25 }}
          />
          <Input
            placeholder="Email"
            type="email"
            value={newEmployee.email}
            onChange={(e) => setNewEmployee((p) => ({ ...p, email: e.target.value }))}
            validation={{ required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }}
          />
          <Input
            placeholder="Contraseña"
            type="password"
            showPassword
            value={newEmployee.password}
            onChange={(e) => setNewEmployee((p) => ({ ...p, password: e.target.value }))}
            validation={{ required: true, minLength: 8, maxLength: 14 }}
          />
          {createError && <p className="text-danger text-sm">{createError}</p>}
          <div className="flex gap-2">
            <Button variant="primary" fullWidth onClick={handleAddEmployee} disabled={isSubmitting}>
              {isSubmitting ? 'Agregando...' : 'Agregar'}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setShowAddEmployeeModal(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={renovateTarget !== null}
        onClose={() => setRenovateTarget(null)}
        title="Renovar suscripción"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setRenovateTarget(null)}>
              Cancelar
            </Button>
            <Button variant="primary" fullWidth onClick={async () => {
              if (renovateTarget) {
                await renewSubscription(renovateTarget.tenantId);
                setRenovateTarget(null);
              }
            }}>
              Confirmar renovación
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            ¿Estás seguro de que quieres renovar la suscripción de{' '}
            <strong>{renovateTarget?.tenantName}</strong> por 30 días?
          </p>
          {renovateTarget?.expiresAt && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
              <span className="font-medium">Vencimiento actual:</span>{' '}
              {new Date(renovateTarget.expiresAt).toLocaleDateString('es-ES')}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={deleteTarget !== null}
        onClose={handleCloseDeleteModal}
        title={deleteTarget?.deletedAt ? 'Eliminar permanentemente' : 'Desactivar local'}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={handleCloseDeleteModal} disabled={isDeleting}>
              Cancelar
            </Button>
            {deleteTarget?.deletedAt ? (
              <Button
                variant="danger"
                fullWidth
                disabled={deleteConfirmText !== 'BORRAR' || isDeleting}
                loading={isDeleting}
                onClick={handleDeleteTenant}
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar permanentemente'}
              </Button>
            ) : (
              <Button variant="danger" fullWidth onClick={handleDeleteTenant} loading={isDeleting}>
                {isDeleting ? 'Desactivando...' : 'Desactivar'}
              </Button>
            )}
          </div>
        }
      >
        {deleteTarget?.deletedAt ? (
          <div className="space-y-4">
            <Alert variant="error">
              ¡ATENCIÓN! Esta acción <strong>NO se puede deshacer</strong>. Se borrarán <strong>todos los datos</strong> del local en cascada:
            </Alert>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>Productos, categorías e imágenes</li>
              <li>Ventas, items de venta e historial</li>
              <li>Inventario, movimientos y lotes</li>
              <li>Proveedores, órdenes de compra</li>
              <li>Usuarios y roles del local</li>
              <li>Suscripciones y tasas de cambio</li>
            </ul>
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p><span className="font-medium text-gray-700">Local:</span> {deleteTarget.name}</p>
              <p><span className="font-medium text-gray-700">Slug:</span> {deleteTarget.slug}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">
                Escribe <strong>BORRAR</strong> para confirmar:
              </p>
              <Input
                placeholder="BORRAR"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert variant="warning">
              Esto desactivará el local y ocultará todos sus datos. Podrás reactivarlo después si es necesario.
            </Alert>
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p><span className="font-medium text-gray-700">Local:</span> {deleteTarget?.name}</p>
              <p><span className="font-medium text-gray-700">Slug:</span> {deleteTarget?.slug}</p>
              <p><span className="font-medium text-gray-700">RIF:</span> {deleteTarget?.rif}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Analytics Modal */}
      <AnalyticsModal
        isOpen={analyticsTarget !== null}
        onClose={() => setAnalyticsTarget(null)}
        analytics={analytics}
        isLoading={showAnalyticsLoading}
        tenantName={analyticsTarget?.name ?? ''}
      />

      {/* Reset Password Modal */}
      <Modal
        isOpen={resetPassTarget !== null}
        onClose={() => setResetPassTarget(null)}
        title={resetPassTarget ? `Restablecer contraseña: ${resetPassTarget.name}` : ''}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setResetPassTarget(null)} disabled={isResetting}>
              Cancelar
            </Button>
            <Button variant="primary" fullWidth onClick={handleResetPasswordSubmit} loading={isResetting}>
              {isResetting ? 'Restableciendo...' : 'Restablecer'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {resetPassError && <Alert variant="error">{resetPassError}</Alert>}
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p><span className="font-medium text-gray-700">Email:</span> {resetPassTarget?.email}</p>
            <p><span className="font-medium text-gray-700">Usuario:</span> {resetPassTarget?.name}</p>
          </div>
          <Input
            label="Nueva contraseña"
            type="password"
            showPassword
            placeholder="Mínimo 8 caracteres"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            validation={{ required: true, minLength: 8, maxLength: 14 }}
          />
        </div>
      </Modal>

      {/* Confirmar eliminación de empleado */}
      <Modal
        isOpen={deleteEmployeeTarget !== null}
        onClose={() => setDeleteEmployeeTarget(null)}
        title="Eliminar empleado"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setDeleteEmployeeTarget(null)} disabled={isDeletingEmployee}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth onClick={handleConfirmDeleteEmployee} loading={isDeletingEmployee}>
              {isDeletingEmployee ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Alert variant="warning">
            ¿Estás seguro de que quieres eliminar a <strong>{deleteEmployeeTarget?.name}</strong>?
          </Alert>
          <p className="text-sm text-gray-600">
            Esta acción desactivará al empleado. No podrá acceder al sistema hasta que un administrador lo reactive.
          </p>
        </div>
      </Modal>

      {/* Crear categoría global */}
      <Modal
        isOpen={showCreateGlobalCatModal}
        onClose={() => setShowCreateGlobalCatModal(false)}
        title="Nueva categoría global"
      >
        <div className="space-y-4">
          <Input
            placeholder="Nombre de la categoría"
            value={globalCatNewName}
            onChange={(e) => { setGlobalCatNewName(e.target.value); setGlobalCatError(null); }}
            error={globalCatError ?? undefined}
            validation={{ required: true, maxLength: 30 }}
          />
          {globalCatError && <p className="text-danger text-sm">{globalCatError}</p>}
          <div className="flex gap-2">
            <Button variant="primary" fullWidth onClick={async () => {
              if (!globalCatNewName.trim()) { setGlobalCatError('Ingresa un nombre'); return; }
              setGlobalCatSubmitting(true);
              const result = await createGlobalCategory({ name: globalCatNewName.trim() });
              setGlobalCatSubmitting(false);
              if (result.ok) {
                setShowCreateGlobalCatModal(false);
                setGlobalCatNewName('');
              } else {
                setGlobalCatError(result.error.message);
              }
            }} disabled={globalCatSubmitting}>
              {globalCatSubmitting ? 'Creando...' : 'Crear'}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setShowCreateGlobalCatModal(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Editar categoría global */}
      <Modal
        isOpen={showEditGlobalCatModal}
        onClose={() => setShowEditGlobalCatModal(false)}
        title="Editar categoría global"
      >
        <div className="space-y-4">
          <Input
            placeholder="Nombre de la categoría"
            value={globalCatEditName}
            onChange={(e) => { setGlobalCatEditName(e.target.value); setGlobalCatError(null); }}
            error={globalCatError ?? undefined}
            validation={{ required: true, maxLength: 30 }}
          />
          {globalCatError && <p className="text-danger text-sm">{globalCatError}</p>}
          <div className="flex gap-2">
            <Button variant="primary" fullWidth onClick={async () => {
              if (!globalCatEditId || !globalCatEditName.trim()) { setGlobalCatError('Ingresa un nombre'); return; }
              setGlobalCatSubmitting(true);
              const result = await updateGlobalCategory(globalCatEditId, globalCatEditName.trim());
              setGlobalCatSubmitting(false);
              if (result.ok) {
                setShowEditGlobalCatModal(false);
                setGlobalCatEditId(null);
              } else {
                setGlobalCatError(result.error.message);
              }
            }} disabled={globalCatSubmitting}>
              {globalCatSubmitting ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setShowEditGlobalCatModal(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Eliminar categoría global */}
      <Modal
        isOpen={globalCatDeleteTarget !== null}
        onClose={() => setGlobalCatDeleteTarget(null)}
        title="Eliminar categoría global"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setGlobalCatDeleteTarget(null)} disabled={globalCatSubmitting}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              fullWidth
              disabled={globalCatConfirmText !== 'BORRAR' || globalCatSubmitting}
              loading={globalCatSubmitting}
              onClick={async () => {
                if (!globalCatDeleteTarget) return;
                setGlobalCatSubmitting(true);
                const result = await deleteGlobalCategory(globalCatDeleteTarget.id);
                setGlobalCatSubmitting(false);
                if (result.ok) {
                  addToast({ type: 'success', message: 'Categoría eliminada.', duration: 4000 });
                } else {
                  addToast({ type: 'error', message: result.error.message, duration: 5000 });
                }
                setGlobalCatDeleteTarget(null);
                setGlobalCatConfirmText('');
              }}
            >
              {globalCatSubmitting ? 'Eliminando...' : 'Eliminar permanentemente'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Alert variant="error">
            ¡ATENCIÓN! Esta acción eliminará la categoría global. Los locales que ya la tienen como predefinida conservarán su copia local, pero dejará de estar disponible para nuevos locales.
          </Alert>
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p><span className="font-medium text-gray-700">Categoría:</span> {globalCatDeleteTarget?.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">
              Escribe <strong>BORRAR</strong> para confirmar:
            </p>
            <Input
              placeholder="BORRAR"
              value={globalCatConfirmText}
              onChange={(e) => setGlobalCatConfirmText(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
