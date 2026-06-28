import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Result, AppError } from '@logiscore/core';
import { KeyRound, Trash2, Shield } from 'lucide-react';
import { Badge, Button, Card, DataTable, Pagination, Tooltip } from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { handleServiceError } from '../../../common/utils/handleServiceError';
import type { UserRole } from '../types';
import type { Role } from '../../../specs/roles';
import { SectionHeader } from './SectionHeader';
import { AddEmployeeModal } from '../../../common/components/AddEmployeeModal';
import { DeleteEmployeeModal } from './DeleteEmployeeModal';
import { ResetPasswordModal } from './ResetPasswordModal';
import { UserOverridesModal } from '../../../common/components/UserOverridesModal';
import { useAuthStore } from '../../../features/auth/stores/authStore';

const PAGE_SIZE = 10;

interface UserSectionProps {
  users: UserRole[];
  selectedTenantId: string | null;
  selectedTenantName: string;
  addEmployee: (payload: unknown) => Promise<Result<{ id: string; email: string; name: string }, AppError>>;
  removeEmployee: (userRoleId: string) => Promise<Result<unknown, AppError>>;
  resetPassword: (userId: string, newPassword: string) => Promise<Result<void, AppError>>;
  updateUserRole: (userRoleId: string, roleId: string) => Promise<Result<void, AppError>>;
  roles: Role[];
  showAddEmployeeModal: boolean;
  onCloseAddEmployeeModal: () => void;
}

export function UserSection({
  users,
  selectedTenantId,
  selectedTenantName,
  addEmployee,
  removeEmployee,
  resetPassword,
  updateUserRole,
  roles,
  showAddEmployeeModal,
  onCloseAddEmployeeModal,
}: UserSectionProps) {
  const { addToast } = useToastStore();
  const session = useAuthStore((s) => s.session);
  const canManage = session?.role === 'owner' || session?.role === 'admin';

  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<{ userId: string; email: string; name: string } | null>(null);
  const [editingRole, setEditingRole] = useState<{ id: string; currentRole: string } | null>(null);
  const [overridesTarget, setOverridesTarget] = useState<{ userId: string; name: string } | null>(null);

  useEffect(() => { setPage(1); }, [users.length]);

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const paginated = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleConfirmDeleteEmployee = useCallback(async (): Promise<unknown> => {
    if (!deleteTarget) return;
    const result = await removeEmployee(deleteTarget.id);
    if (result.ok) {
      addToast({ type: 'success', message: 'Empleado eliminado.', duration: 4000 });
    } else {
      handleServiceError(result);
    }
  }, [deleteTarget, removeEmployee, addToast]);

  const handleResetPassword = useCallback(async (userId: string, newPassword: string): Promise<Result<void, AppError>> => {
    const result = await resetPassword(userId, newPassword);
    if (result.ok) {
      addToast({ type: 'success', message: 'Contraseña restablecida exitosamente.', duration: 4000 });
    }
    return result;
  }, [resetPassword, addToast]);

  const handleRoleChange = useCallback(async (userRoleId: string, roleId: string) => {
    if (!roleId) return;
    const roleName = roles.find((r) => r.id === roleId)?.name ?? '';
    if (!roleName) return;

    const result = await updateUserRole(userRoleId, roleId);
    if (result.ok) {
      addToast({ type: 'success', message: `Rol actualizado a ${roleName}.`, duration: 4000 });
    } else {
      handleServiceError(result);
    }
    setEditingRole(null);
  }, [roles, updateUserRole, addToast]);

  const columns: Column<UserRole>[] = useMemo(() => [
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Rol',
      render: (u) => {
        if (u.role === 'owner') {
          return <Badge variant="info">Propietario</Badge>;
        }

        if (editingRole?.id === u.id) {
          return (
            <select
              className="select text-sm py-2.5 px-2 min-w-[130px] min-h-11"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleRoleChange(u.id, e.target.value);
                }
              }}
              onBlur={() => setEditingRole(null)}
              autoFocus
            >
              <option value="">Seleccionar...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          );
        }

        return (
          <button
            type="button"
            className="text-sm text-primary underline hover:no-underline cursor-pointer"
            onClick={() => setEditingRole({ id: u.id, currentRole: u.role })}
          >
            {u.role}
          </button>
        );
      },
    },
    { key: 'createdAt', header: 'Creado', hideOnMobile: true },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'overflow-visible',
      render: (u) => (
        <div className="flex gap-1 items-center">
          {u.role === 'owner' && <Badge variant="info">Propietario</Badge>}
          {u.role !== 'owner' && canManage && (
            <Tooltip content="Permisos individuales" variant="help" position="top">
              <Button
                variant="ghost-primary"
                size="sm"
                className="min-h-11 admin-ripple"
                aria-label="Permisos individuales"
                onClick={() => setOverridesTarget({ userId: u.userId, name: u.name })}
              >
                <Shield size={16} />
              </Button>
            </Tooltip>
          )}
          <Tooltip content="Restablecer contraseña" variant="help" position="top">
            <Button
              variant="ghost-primary"
              size="sm"
              className="min-h-11 admin-ripple"
              aria-label="Restablecer contraseña"
              onClick={() => setResetTarget({ userId: u.userId, email: u.email ?? u.id, name: u.name ?? u.email ?? u.id })}
            >
              <KeyRound size={16} />
            </Button>
          </Tooltip>
          {u.role !== 'owner' && (
            <Tooltip content="Eliminar empleado" variant="danger" position="top">
              <Button
                variant="ghost-danger"
                size="sm"
                className="min-h-11 admin-ripple"
                aria-label="Eliminar empleado"
                onClick={() => setDeleteTarget({ id: u.id, name: u.name })}
              >
                <Trash2 size={16} />
              </Button>
            </Tooltip>
          )}
        </div>
      ),
    },
  ], [editingRole, roles, handleRoleChange]);

  return (
    <>
      <Card className="admin-card-hover">
        <div className="p-4 pb-0">
          <SectionHeader
            icon={<KeyRound size={20} className="text-primary" />}
            title="Usuarios"
            subtitle={`${selectedTenantName} — ${users.length} usuario${users.length !== 1 ? 's' : ''}`}
          />
        </div>
        <div className="p-4 pt-0">
          <DataTable
            columns={columns}
            data={paginated}
            emptyMessage="Aún no hay usuarios registrados en este local."
            keyExtractor={(u: UserRole) => u.id}
            renderCardOnMobile
          />
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </div>
      </Card>

      <AddEmployeeModal
        isOpen={showAddEmployeeModal}
        onClose={onCloseAddEmployeeModal}
        tenantId={selectedTenantId}
        tenantName={selectedTenantName}
        onAddEmployee={addEmployee}
        roles={roles}
      />

      <DeleteEmployeeModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        employeeName={deleteTarget?.name ?? ''}
        onConfirm={handleConfirmDeleteEmployee}
      />

      <ResetPasswordModal
        isOpen={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        userEmail={resetTarget?.email ?? ''}
        userName={resetTarget?.name ?? ''}
        userId={resetTarget?.userId ?? ''}
        onReset={handleResetPassword}
      />

      <UserOverridesModal
        isOpen={overridesTarget !== null}
        onClose={() => setOverridesTarget(null)}
        userId={overridesTarget?.userId ?? ''}
        userName={overridesTarget?.name ?? ''}
      />
    </>
  );
}
