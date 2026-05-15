import { useEffect, useState, useCallback } from 'react';
import { useAdminPanel } from '../hooks/useAdminPanel';
import { EventBus, SystemEvents } from '@logiscore/core';
import { CreateTenantWithUsersInputSchema } from '../types';
import type { Tenant, UserRole, GlobalUser, SubscriptionView } from '../types';
import type { Column } from '../../../common/components/DataTable';
import {
  Alert,
  AppShell,
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Modal,
  Spinner,
  LogoutButton,
} from '../../../common/components';
import { useToastStore } from '../../../stores/toastStore';
import { Store, Building2, UsersRound, ArrowLeft, Plus, Trash2, Eye, Users as UsersIcon, CreditCard, RefreshCw } from 'lucide-react';

interface EmployeeForm {
  email: string;
  password: string;
  name: string;
}

interface CreateForm {
  tenant: { name: string; rif: string };
  owner: { email: string; password: string; name: string };
  employees: EmployeeForm[];
}

interface EditForm {
  name: string;
  rif: string;
}

const emptyCreateForm: CreateForm = {
  tenant: { name: '', rif: '' },
  owner: { email: '', password: '', name: '' },
  employees: [],
};

type Sheet = 'tenants' | 'users' | 'all-users' | 'subscriptions';

export function AdminPanelPage() {
  const {
    tenants, users, allUsers, subscriptions, isLoading, error,
    fetchTenants, fetchUsers, fetchAllUsers, fetchSubscriptions, renewSubscription,
    createTenant, addEmployee, updateTenant, removeEmployee,
    softDeleteTenant, hardDeleteTenant,
  } = useAdminPanel();

  const [activeSheet, setActiveSheet] = useState<Sheet>('tenants');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedTenantName, setSelectedTenantName] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);

  const [renovateTarget, setRenovateTarget] = useState<SubscriptionView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', rif: '' });
  const [newEmployee, setNewEmployee] = useState<EmployeeForm>({ email: '', password: '', name: '' });

  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { addToast } = useToastStore();
  const handleCloseDeleteModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteConfirmText('');
  }, []);

  useEffect(() => {
    fetchTenants();
    fetchAllUsers();
    fetchSubscriptions();
  }, [fetchTenants, fetchAllUsers, fetchSubscriptions]);

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
    setEditForm({ name: tenant.name, rif: tenant.rif });
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

  const handleRemoveEmployee = async (userRoleId: string) => {
    await removeEmployee(userRoleId);
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
    { key: 'plan', header: 'Plan'},
    {
      key: 'status',
      header: 'Estado',
      render: (t) => (
        t.deletedAt
          ? <Badge variant="neutral">Inactivo</Badge>
          : <Badge variant="success">Activo</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (t) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleNavigateTenant(t.slug)}>
            <Eye size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(t)}>
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleSelectTenant(t)}>
            <UsersIcon size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(t)}>
            <Trash2 size={16} className="text-gray-400 hover:text-danger" />
          </Button>
        </div>
      ),
    },
  ];

  const userColumns: Column<UserRole>[] = [
    { key: 'id', header: 'ID', hideOnMobile: true },
    { key: 'role', header: 'Rol' },
    { key: 'createdAt', header: 'Creado', hideOnMobile: true },
    {
      key: 'actions',
      header: 'Acciones',
      render: (u) => {
        if (u.role === 'owner') return <Badge variant="info">Propietario</Badge>;
        return (
          <Button variant="danger" size="sm" onClick={() => handleRemoveEmployee(u.id)}>
            <Trash2 size={16} />
          </Button>
        );
      },
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
            <Store size={18} className="text-primary" />
            <span className="font-semibold text-sm text-primary">Panel Admin</span>
          </div>
          <div className="flex-1" />
          {activeSheet === 'tenants' ? (
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> Nuevo Local
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
          ) : null}
          <LogoutButton />
        </div>
      }
    >
      <div className="flex border-b border-gray-200 bg-white sticky top-14 z-10">
        <Button
          variant="ghost"
          className={`rounded-none border-b-2 px-5 py-3 ${
            activeSheet === 'tenants'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
          }`}
          onClick={() => setActiveSheet('tenants')}
        >
          <Building2 size={16} />
          Locales
        </Button>
        <Button
          variant="ghost"
          className={`rounded-none border-b-2 px-5 py-3 ${
            activeSheet === 'all-users'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
          }`}
          onClick={() => setActiveSheet('all-users')}
        >
          <UsersRound size={16} />
          Todos los Usuarios
        </Button>
        <Button
          variant="ghost"
          className={`rounded-none border-b-2 px-5 py-3 ${
            activeSheet === 'subscriptions'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
          }`}
          onClick={() => setActiveSheet('subscriptions')}
        >
          <CreditCard size={16} />
          Suscripciones
        </Button>
      </div>

      <div className="p-6 space-y-6">
        {activeSheet === 'tenants' && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Locales</h2>
                <p className="text-sm text-gray-500 mt-0.5">{tenants.length} local{tenants.length !== 1 ? 'es' : ''}</p>
              </div>
            </div>
            <DataTable
              columns={tenantColumns}
              data={tenants}
              emptyMessage="No hay locales creados. Crea el primero."
              keyExtractor={(t: Tenant) => t.id}
              renderCardOnMobile
            />
          </Card>
        )}

        {activeSheet === 'users' && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Usuarios</h2>
                <p className="text-sm text-gray-500 mt-0.5">{selectedTenantName} — {users.length} usuario{users.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <DataTable
              columns={userColumns}
              data={users}
              emptyMessage="No hay usuarios en este local."
              keyExtractor={(u: UserRole) => u.id}
              renderCardOnMobile
            />
          </Card>
        )}

        {activeSheet === 'all-users' && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Todos los Usuarios</h2>
                <p className="text-sm text-gray-500 mt-0.5">{allUsers.length} usuario{allUsers.length !== 1 ? 's' : ''} registrados</p>
              </div>
            </div>
            <DataTable
              columns={[
                { key: 'email', header: 'Email' },
                { key: 'name', header: 'Nombre' },
                { key: 'role', header: 'Rol' },
                { key: 'tenantName', header: 'Local'},
              ]}
              data={allUsers}
              emptyMessage="No hay usuarios registrados."
              keyExtractor={(u: GlobalUser) => u.id}
              renderCardOnMobile
            />
          </Card>
        )}

        {activeSheet === 'subscriptions' && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Suscripciones</h2>
                <p className="text-sm text-gray-500 mt-0.5">{subscriptions.length} local{subscriptions.length !== 1 ? 'es' : ''}</p>
              </div>
            </div>
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
                    return <Badge variant={variant}>{s.status}</Badge>;
                  },
                },
                {
                  key: 'expiresAt',
                  header: 'Vence',
                  render: (s: SubscriptionView) => {
                    if (!s.expiresAt) return <span className="text-gray-400">-</span>;
                    const date = new Date(s.expiresAt).toLocaleDateString('es-ES');
                    const color = s.daysRemaining <= 0 ? 'text-danger font-bold'
                      : s.daysRemaining <= 3 ? 'text-warning font-bold'
                      : s.daysRemaining <= 7 ? 'text-orange-600'
                      : 'text-gray-700';
                    return (
                      <span className={color}>
                        {date} {s.daysRemaining <= 0 ? '(Vencido)' : `(${s.daysRemaining}d)`}
                      </span>
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
                        {canRenew ? 'Renovar +30d' : 'Activa'}
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
          </Card>
        )}
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setCreateError(null); }}
        title="Crear nuevo local"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Datos del Tenant</p>
            <Input
              placeholder="Nombre"
              value={createForm.tenant.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, name: e.target.value } }))}
            />
            <Input
              placeholder="RIF (V123456789)"
              value={createForm.tenant.rif}
              onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, rif: e.target.value.toUpperCase() } }))}
              className="mt-2"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Propietario (obligatorio)</p>
            <Input
              placeholder="Nombre del owner"
              value={createForm.owner.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, name: e.target.value } }))}
            />
            <Input
              placeholder="Email del owner"
              type="email"
              value={createForm.owner.email}
              onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, email: e.target.value } }))}
              className="mt-2"
            />
            <Input
              placeholder="Contraseña"
              type="password"
              value={createForm.owner.password}
              onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, password: e.target.value } }))}
              className="mt-2"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Empleados (opcional, max 3)</p>
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
              <div key={i} className="border rounded p-2 mb-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Empleado #{i + 1}</span>
                  <Button variant="danger" size="sm" onClick={() => removeEmployeeRow(i)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
                <Input
                  placeholder="Nombre"
                  value={emp.name}
                  onChange={(e) => updateEmployeeRow(i, 'name', e.target.value)}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={emp.email}
                  onChange={(e) => updateEmployeeRow(i, 'email', e.target.value)}
                />
                <Input
                  placeholder="Contraseña"
                  type="password"
                  value={emp.password}
                  onChange={(e) => updateEmployeeRow(i, 'password', e.target.value)}
                />
              </div>
            ))}
          </div>

          {createError && <p className="text-danger text-sm">{createError}</p>}

          <div className="flex gap-2">
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
        onClose={() => setShowEditModal(false)}
        title="Editar local"
      >
        <div className="space-y-4">
          <Input
            placeholder="Nombre"
            value={editForm.name}
            onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            placeholder="RIF"
            value={editForm.rif}
            onChange={(e) => setEditForm((p) => ({ ...p, rif: e.target.value.toUpperCase() }))}
          />
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
        onClose={() => { setShowAddEmployeeModal(false); setCreateError(null); }}
        title={`Agregar empleado a ${selectedTenantName}`}
      >
        <div className="space-y-4">
          <Input
            placeholder="Nombre"
            value={newEmployee.name}
            onChange={(e) => setNewEmployee((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            placeholder="Email"
            type="email"
            value={newEmployee.email}
            onChange={(e) => setNewEmployee((p) => ({ ...p, email: e.target.value }))}
          />
          <Input
            placeholder="Contraseña"
            type="password"
            value={newEmployee.password}
            onChange={(e) => setNewEmployee((p) => ({ ...p, password: e.target.value }))}
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
    </AppShell>
  );
}
