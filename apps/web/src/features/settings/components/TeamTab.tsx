import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, ShoppingBag, Plus, Shield } from 'lucide-react';
import { Card, Button, DataTable, Skeleton, Alert, Badge, Select, Modal, Input } from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { handleServiceError } from '../../../common/utils/handleServiceError';
import { adminService } from '../../admin/services/adminService';
import { settingsService } from '../services/settingsService';
import { AddEmployeeModal } from '../../../common/components/AddEmployeeModal';
import { RegisterManagerModal } from '../../../common/components/RegisterManagerModal';
import { RolePermissionsModal } from '../../../common/components/RolePermissionsModal';
import { UserOverridesModal } from '../../../common/components/UserOverridesModal';
import { useAuthStore } from '../../auth/stores/authStore';
import type { UserRole } from '../../admin/types';
import type { DexieRegisterConfig } from '../../../services/dexie/db';
import type { Role } from '../../../specs/roles';

interface TeamTabProps {
  tenantId: string;
}

export function TeamTab({ tenantId }: TeamTabProps) {
  const { addToast } = useToastStore();
  const session = useAuthStore((s) => s.session);
  const isOwner = session?.role === 'owner';

  const [users, setUsers] = useState<UserRole[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [registers, setRegisters] = useState<DexieRegisterConfig[]>([]);
  const [registersLoading, setRegistersLoading] = useState(true);
  const [registersError, setRegistersError] = useState<string | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);
  const [tenantName, setTenantName] = useState('');

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showRegisterManager, setShowRegisterManager] = useState(false);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState('');
  const [deletingUser, setDeletingUser] = useState<UserRole | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserRole | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [overridesTarget, setOverridesTarget] = useState<{ userId: string; name: string } | null>(null);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    const result = await adminService.fetchUsers(tenantId);
    if (result.ok) {
      setUsers(result.data);
    } else {
      setUsersError(result.error.message);
    }
    setUsersLoading(false);
  }, [tenantId]);

  const loadRegisters = useCallback(async () => {
    setRegistersLoading(true);
    setRegistersError(null);
    const result = await adminService.getRegisters(tenantId);
    if (result.ok) {
      setRegisters(result.data);
    } else {
      setRegistersError(result.error.message);
    }
    setRegistersLoading(false);
  }, [tenantId]);

  const loadRoles = useCallback(async () => {
    const result = await adminService.fetchRoles();
    if (result.ok) {
      setRoles(result.data);
    }
  }, []);

  const loadTenantName = useCallback(async () => {
    const result = await settingsService.getBusinessInfo(tenantId);
    if (result.ok) {
      setTenantName(result.data.name);
    }
  }, [tenantId]);

  useEffect(() => {
    loadUsers();
    loadRegisters();
    loadRoles();
    loadTenantName();
  }, [loadUsers, loadRegisters, loadRoles, loadTenantName]);

  const handleAddEmployee = useCallback(async (payload: unknown) => {
    const result = await adminService.addEmployee(payload);
    if (result.ok) {
      addToast({ type: 'success', message: 'Empleado creado correctamente.', duration: 4000 });
      await loadUsers();
    }
    return result;
  }, [addToast, loadUsers]);

  const handleUpdateRole = useCallback(async (userRoleId: string, roleId: string) => {
    const result = await adminService.updateUserRole(userRoleId, roleId);
    if (result.ok) {
      addToast({ type: 'success', message: 'Rol actualizado correctamente.', duration: 4000 });
      setEditingUserId(null);
      await loadUsers();
    } else {
      handleServiceError(result);
    }
  }, [addToast, loadUsers]);

  const handleDeleteEmployee = useCallback(async () => {
    if (!deletingUser) return;
    const result = await adminService.removeEmployee(deletingUser.id);
    if (result.ok) {
      addToast({ type: 'success', message: 'Empleado eliminado correctamente.', duration: 4000 });
      setDeletingUser(null);
      await loadUsers();
    } else {
      handleServiceError(result);
    }
  }, [deletingUser, addToast, loadUsers]);

  const handleResetPassword = useCallback(async () => {
    if (!resetPasswordUser || !newResetPassword) return;
    const result = await adminService.resetPassword(resetPasswordUser.userId, newResetPassword);
    if (result.ok) {
      addToast({ type: 'success', message: 'Contraseña restablecida correctamente.', duration: 4000 });
      setResetPasswordUser(null);
      setNewResetPassword('');
    } else {
      handleServiceError(result);
    }
  }, [resetPasswordUser, newResetPassword, addToast]);

  const userColumns: Column<UserRole>[] = useMemo(() => [
    { key: 'name', header: 'Nombre', render: (u) => u.name || u.email || '—' },
    {
      key: 'email', header: 'Email', hideOnMobile: true, render: (u) => u.email || '—',
    },
    {
      key: 'role',
      header: 'Rol',
      render: (u) => {
        if (u.role === 'owner') return <Badge variant="info">Propietario</Badge>;
        if (editingUserId === u.id) {
          return (
            <Select
              value={editingRoleId}
              onChange={(e) => setEditingRoleId(e.target.value)}
              className="text-xs"
            >
              {roles.filter((r) => r.name !== 'admin' && r.name !== 'owner').map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
          );
        }
        return <Badge variant="neutral">{u.role}</Badge>;
      },
    },
    ...(isOwner ? [{
      key: 'actions',
      header: '',
      render: (u: UserRole) => {
        if (u.role === 'owner') return null;
        return (
          <div className="flex gap-1">
            {editingUserId === u.id ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => handleUpdateRole(u.id, editingRoleId)}>
                  Guardar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingUserId(null)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => { setEditingUserId(u.id); setEditingRoleId(u.role === 'employee' ? roles[0]?.id || '' : ''); }} aria-label={`Editar rol de ${u.name || u.email}`}>
                  Editar rol
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOverridesTarget({ userId: u.userId, name: u.name || u.email })} aria-label={`Permisos individuales de ${u.name || u.email}`}>
                  Permisos
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setResetPasswordUser(u)} aria-label={`Restablecer contraseña de ${u.name || u.email}`}>
                  Restablecer contraseña
                </Button>
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeletingUser(u)} aria-label={`Eliminar a ${u.name || u.email}`}>
                  Eliminar
                </Button>
              </>
            )}
          </div>
        );
      },
    }] : []),
  ], [editingUserId, editingRoleId, roles, isOwner, handleUpdateRole]);

  const registerColumns: Column<DexieRegisterConfig>[] = useMemo(() => [
    { key: 'name', header: 'Nombre' },
    {
      key: 'isActive',
      header: 'Estado',
      render: (r) => (
        r.isActive
          ? <Badge variant="success">Activo</Badge>
          : <Badge variant="neutral">Inactivo</Badge>
      ),
    },
  ], []);

  return (
    <div className="space-y-8">
      <Card className="hover:shadow-md transition-shadow duration-200">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                <Users size={20} className="text-primary" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Empleados</h2>
                <Badge variant="neutral" className="text-xs">{users.length}</Badge>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="min-h-11 transition-all duration-200"
              onClick={() => setShowAddEmployee(true)}
            >
              <Plus size={16} />
              <span className="hidden sm:inline ml-1">Crear empleado</span>
            </Button>
          </div>

          {usersLoading ? (
            <div className="space-y-2">
              <Skeleton variant="shimmer" className="h-10 rounded-lg" />
              <Skeleton variant="shimmer" className="h-10 rounded-lg" />
              <Skeleton variant="shimmer" className="h-10 rounded-lg" />
            </div>
          ) : usersError ? (
            <Alert variant="error">{usersError}</Alert>
          ) : (
            <DataTable
              columns={userColumns}
              data={users}
              emptyMessage="No hay empleados registrados."
              keyExtractor={(u) => u.id}
              renderCardOnMobile
            />
          )}
        </div>
      </Card>

      <Card className="hover:shadow-md transition-shadow duration-200">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                <Shield size={20} className="text-primary" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Roles</h2>
                <Badge variant="neutral" className="text-xs">{roles.filter(r => r.name !== 'admin' && r.name !== 'owner').length}</Badge>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="min-h-11 transition-all duration-200"
              onClick={() => { setEditingRole(null); setShowRoleModal(true); }}
            >
              <Plus size={16} />
              <span className="hidden sm:inline ml-1">Crear rol</span>
            </Button>
          </div>

          <div className="space-y-2">
            {roles.filter(r => r.name !== 'admin' && r.name !== 'owner').map((role) => (
              <div key={role.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant={role.rlsTier === 'owner' ? 'info' : 'neutral'}>{role.rlsTier}</Badge>
                  <div>
                    <div className="font-medium text-sm">{role.name}</div>
                    {role.description && <div className="text-xs text-gray-500">{role.description}</div>}
                  </div>
                  <Badge variant="neutral" className="text-xs">{(role as Role & { permissionCount?: number }).permissionCount ?? 0} permisos</Badge>
                </div>
          <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setEditingRole(role); setShowRoleModal(true); }}>
                    Editar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="hover:shadow-md transition-shadow duration-200">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                <ShoppingBag size={20} className="text-primary" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Cajas</h2>
                <Badge variant="neutral" className="text-xs">{registers.length}</Badge>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="min-h-11 transition-all duration-200"
              onClick={() => setShowRegisterManager(true)}
            >
              <Plus size={16} />
              <span className="hidden sm:inline ml-1">Gestionar cajas</span>
            </Button>
          </div>

          {registersLoading ? (
            <div className="space-y-2">
              <Skeleton variant="shimmer" className="h-10 rounded-lg" />
              <Skeleton variant="shimmer" className="h-10 rounded-lg" />
            </div>
          ) : registersError ? (
            <Alert variant="error">{registersError}</Alert>
          ) : (
            <DataTable
              columns={registerColumns}
              data={registers}
              emptyMessage="No hay cajas configuradas."
              keyExtractor={(r) => r.id}
              renderCardOnMobile
            />
          )}
        </div>
      </Card>

      <AddEmployeeModal
        isOpen={showAddEmployee}
        onClose={() => setShowAddEmployee(false)}
        tenantId={tenantId}
        tenantName={tenantName}
        onAddEmployee={handleAddEmployee}
        roles={roles}
      />

      <RegisterManagerModal
        isOpen={showRegisterManager}
        onClose={() => setShowRegisterManager(false)}
        tenantId={tenantId}
      />

      <Modal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        title="Eliminar empleado"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setDeletingUser(null)}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth onClick={handleDeleteEmployee}>
              Eliminar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-700">
          ¿Eliminar a <strong>{deletingUser?.name || deletingUser?.email}</strong>? Esta acción desactivará al empleado.
        </p>
      </Modal>

      <Modal
        isOpen={!!resetPasswordUser}
        onClose={() => { setResetPasswordUser(null); setNewResetPassword(''); }}
        title={`Restablecer contraseña: ${resetPasswordUser?.name || ''}`}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => { setResetPasswordUser(null); setNewResetPassword(''); }}>
              Cancelar
            </Button>
            <Button variant="primary" fullWidth onClick={handleResetPassword} disabled={!newResetPassword || newResetPassword.length < 8}>
              Restablecer
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Email: {resetPasswordUser?.email}
          </p>
          <Input
            label="Nueva contraseña"
            type="password"
            maxLength={14}
            value={newResetPassword}
            onChange={(e) => setNewResetPassword(e.target.value)}
            hint="Mín. 8 y máx. 14 caracteres"
            autoComplete="new-password"
          />
        </div>
      </Modal>

      <RolePermissionsModal
        isOpen={showRoleModal}
        onClose={() => { setShowRoleModal(false); setEditingRole(null); }}
        role={editingRole}
        onSave={() => { loadRoles(); setShowRoleModal(false); setEditingRole(null); }}
      />

      <UserOverridesModal
        isOpen={overridesTarget !== null}
        onClose={() => setOverridesTarget(null)}
        userId={overridesTarget?.userId ?? ''}
        userName={overridesTarget?.name ?? ''}
        tenantId={tenantId}
      />
    </div>
  );
}
