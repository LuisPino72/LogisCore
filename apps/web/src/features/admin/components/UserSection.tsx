import { useState, useCallback, useEffect } from 'react';
import type { Result, AppError } from '@logiscore/core';
import { KeyRound, Trash2 } from 'lucide-react';
import { Badge, Button, Card, DataTable, Pagination, Tooltip } from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import type { UserRole } from '../types';
import { AddEmployeeModal } from './AddEmployeeModal';
import { DeleteEmployeeModal } from './DeleteEmployeeModal';
import { ResetPasswordModal } from './ResetPasswordModal';

const PAGE_SIZE = 10;

interface UserSectionProps {
  users: UserRole[];
  selectedTenantId: string | null;
  selectedTenantName: string;
  addEmployee: (payload: unknown) => Promise<Result<{ id: string; email: string; name: string }, AppError>>;
  removeEmployee: (userRoleId: string) => Promise<Result<unknown, AppError>>;
  resetPassword: (userId: string, newPassword: string) => Promise<Result<void, AppError>>;
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
  showAddEmployeeModal,
  onCloseAddEmployeeModal,
}: UserSectionProps) {
  const { addToast } = useToastStore();

  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<{ userId: string; email: string; name: string } | null>(null);

  useEffect(() => { setPage(1); }, [users.length]);

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const paginated = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleConfirmDeleteEmployee = useCallback(async (): Promise<unknown> => {
    if (!deleteTarget) return;
    const result = await removeEmployee(deleteTarget.id);
    if (result.ok) {
      addToast({ type: 'success', message: 'Empleado eliminado.', duration: 4000 });
    } else {
      addToast({ type: 'error', message: result.error.message, duration: 5000 });
    }
  }, [deleteTarget, removeEmployee, addToast]);

  const handleResetPassword = useCallback(async (userId: string, newPassword: string): Promise<Result<void, AppError>> => {
    const result = await resetPassword(userId, newPassword);
    if (result.ok) {
      addToast({ type: 'success', message: 'Contraseña restablecida exitosamente.', duration: 4000 });
    }
    return result;
  }, [resetPassword, addToast]);

  const columns: Column<UserRole>[] = [
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetTarget({ userId: u.userId, email: u.email ?? u.id, name: u.name ?? u.email ?? u.id })}
            >
              <KeyRound size={16} />
            </Button>
          </Tooltip>
          {u.role !== 'owner' && (
            <Tooltip content="Eliminar empleado" position="top">
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteTarget({ id: u.id, name: u.name })}
              >
                <Trash2 size={16} />
              </Button>
            </Tooltip>
          )}
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
              <KeyRound size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-title font-bold text-gray-900">Usuarios</h2>
              <p className="text-xs text-text-secondary">
                {selectedTenantName} — {users.length} usuario{users.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
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
    </>
  );
}
