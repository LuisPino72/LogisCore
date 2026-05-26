import { useState, useCallback, useEffect } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import type { Result, AppError } from '@logiscore/core';
import {
  Building2,
  Eye,
  Trash2,
  MoreVertical,
  RotateCcw,
  BarChart3,
  Users as UsersIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dropdown,
  Pagination,
  SearchInput,
  Select,
  Tooltip,
} from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import type {
  Tenant,
  TenantAnalytics,
  CreateTenantWithUsersInput,
  CreateTenantResponse,
} from '../types';
import { CreateTenantModal } from './CreateTenantModal';
import { EditTenantModal } from './EditTenantModal';
import { DeleteTenantModal } from './DeleteTenantModal';
import { AddEmployeeModal } from './AddEmployeeModal';
import { AnalyticsModal } from './AnalyticsModal';

const PAGE_SIZE = 10;

interface EditForm {
  name: string;
  rif: string;
  direccion: string;
  telefono: string;
}

interface TenantSectionProps {
  tenants: Tenant[];
  filteredTenants: Tenant[];
  filters: { search: string; status: string; plan: string };
  setSearch: (v: string) => void;
  setStatus: (status: 'all' | 'active' | 'inactive') => void;
  setPlan: (plan: string) => void;
  onSelectTenant: (tenant: Tenant) => void;
  createTenant: (payload: CreateTenantWithUsersInput) => Promise<Result<CreateTenantResponse, AppError>>;
  updateTenant: (id: string, data: EditForm) => Promise<Result<Tenant, AppError>>;
  softDeleteTenant: (id: string) => Promise<Result<unknown, AppError>>;
  hardDeleteTenant: (id: string) => Promise<Result<unknown, AppError>>;
  restoreTenant: (id: string) => Promise<unknown>;
  addEmployee: (payload: { email: string; password: string; name: string; tenantId: string }) => Promise<Result<{ id: string; email: string; name: string }, AppError>>;
  fetchAnalytics: (tenantId: string) => Promise<void>;
  analytics: TenantAnalytics | null;
  showCreateModal: boolean;
  onCloseCreateModal: () => void;
}

export function TenantSection({
  tenants,
  filteredTenants,
  filters,
  setSearch,
  setStatus,
  setPlan,
  onSelectTenant,
  createTenant,
  updateTenant,
  softDeleteTenant,
  hardDeleteTenant,
  restoreTenant,
  addEmployee,
  fetchAnalytics,
  analytics,
  showCreateModal,
  onCloseCreateModal,
}: TenantSectionProps) {
  const { addToast } = useToastStore();

  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<Tenant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<{ id: string; name: string } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showAddFromEdit, setShowAddFromEdit] = useState(false);
  const [addFromEditTenantId, setAddFromEditTenantId] = useState<string | null>(null);
  const [addFromEditTenantName, setAddFromEditTenantName] = useState('');

  useEffect(() => { setPage(1); }, [filteredTenants.length]);

  const totalPages = Math.max(1, Math.ceil(filteredTenants.length / PAGE_SIZE));
  const paginated = filteredTenants.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleNavigateTenant = useCallback((slug: string) => {
    EventBus.emit(SystemEvents.ADMIN_NAVIGATE_TENANT, { tenantSlug: slug });
  }, []);

  const handleOpenAnalytics = useCallback(async (tenant: Tenant) => {
    setAnalyticsTarget({ id: tenant.id, name: tenant.name });
    setAnalyticsLoading(true);
    await fetchAnalytics(tenant.id);
    setAnalyticsLoading(false);
  }, [fetchAnalytics]);

  const handleSoftDelete = useCallback(async (id: string) => {
    try {
      const result = await softDeleteTenant(id);
      if (result.ok) {
        addToast({ type: 'success', message: 'Local desactivado correctamente.', duration: 4000 });
      } else {
        addToast({ type: 'error', message: result.error.message, duration: 5000 });
      }
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Error al desactivar el local', duration: 5000 });
    }
  }, [softDeleteTenant, addToast]);

  const handleHardDelete = useCallback(async (id: string) => {
    try {
      const result = await hardDeleteTenant(id);
      if (result.ok) {
        addToast({ type: 'success', message: 'Local eliminado permanentemente.', duration: 4000 });
      } else {
        addToast({ type: 'error', message: result.error.message, duration: 5000 });
      }
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Error al eliminar el local', duration: 5000 });
    }
  }, [hardDeleteTenant, addToast]);

  const handleAddEmployeeFromEdit = useCallback((tenant: Tenant) => {
    setEditTarget(null);
    setAddFromEditTenantId(tenant.id);
    setAddFromEditTenantName(tenant.name);
    setShowAddFromEdit(true);
  }, []);

  const columns: Column<Tenant>[] = [
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
            <Button variant="ghost" size="sm" onClick={() => setEditTarget(t)}>
              <span className="hidden sm:inline">Editar</span>
              <span className="sm:hidden">✎</span>
            </Button>
          </Tooltip>
          <Dropdown
            align="left"
            trigger={
              <Tooltip content="Más opciones" position="left">
                <MoreVertical size={18} className="text-gray-500 cursor-pointer" />
              </Tooltip>
            }
            items={[
              { label: 'Ver usuarios', icon: <UsersIcon size={16} />, onClick: () => onSelectTenant(t) },
              { label: 'Analíticas', icon: <BarChart3 size={16} />, onClick: () => handleOpenAnalytics(t) },
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

  return (
    <>
      <Card>
        <div className="p-4 pb-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-title font-bold text-gray-900">Locales</h2>
              <p className="text-xs text-text-secondary">
                {tenants.length} local{tenants.length !== 1 ? 'es' : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <SearchInput
              placeholder="Buscar local..."
              maxLength={15}
              value={filters.search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-50"
            />
            <Select
              value={filters.status}
              onChange={(e) => setStatus(e.target.value as 'all' | 'active' | 'inactive')}
              className="w-32.5"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </Select>
            <Select
              value={filters.plan}
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
            columns={columns}
            data={paginated}
            emptyMessage="Aún no hay locales que coincidan con los filtros."
            keyExtractor={(t: Tenant) => t.id}
            renderCardOnMobile
          />
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </div>
      </Card>

      <CreateTenantModal
        isOpen={showCreateModal}
        onClose={onCloseCreateModal}
        onCreateTenant={createTenant}
      />

      <EditTenantModal
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        tenant={editTarget}
        onSave={updateTenant}
        onAddEmployeeClick={() => editTarget && handleAddEmployeeFromEdit(editTarget)}
      />

      <DeleteTenantModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        tenant={deleteTarget}
        onSoftDelete={handleSoftDelete}
        onHardDelete={handleHardDelete}
      />

      <AnalyticsModal
        isOpen={analyticsTarget !== null}
        onClose={() => setAnalyticsTarget(null)}
        analytics={analytics}
        isLoading={analyticsLoading}
        tenantName={analyticsTarget?.name ?? ''}
      />

      <AddEmployeeModal
        isOpen={showAddFromEdit}
        onClose={() => setShowAddFromEdit(false)}
        tenantId={addFromEditTenantId}
        tenantName={addFromEditTenantName}
        onAddEmployee={addEmployee}
      />
    </>
  );
}
