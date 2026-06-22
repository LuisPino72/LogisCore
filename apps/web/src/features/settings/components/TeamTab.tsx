import { useState, useEffect, useCallback } from 'react';
import { Users, ShoppingBag, Plus } from 'lucide-react';
import { Card, Button, DataTable, Skeleton, Alert, Badge } from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { adminService } from '../../admin/services/adminService';
import { AddEmployeeModal } from '../../../common/components/AddEmployeeModal';
import { RegisterManagerModal } from '../../../common/components/RegisterManagerModal';
import type { UserRole } from '../../admin/types';
import type { DexieRegisterConfig } from '../../../services/dexie/db';
import type { Role } from '../../../specs/roles';

interface TeamTabProps {
  tenantId: string;
}

export function TeamTab({ tenantId }: TeamTabProps) {
  const { addToast } = useToastStore();

  const [users, setUsers] = useState<UserRole[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [registers, setRegisters] = useState<DexieRegisterConfig[]>([]);
  const [registersLoading, setRegistersLoading] = useState(true);
  const [registersError, setRegistersError] = useState<string | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showRegisterManager, setShowRegisterManager] = useState(false);

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

  useEffect(() => {
    loadUsers();
    loadRegisters();
    loadRoles();
  }, [loadUsers, loadRegisters, loadRoles]);

  const handleAddEmployee = useCallback(async (payload: unknown) => {
    const result = await adminService.addEmployee(payload);
    if (result.ok) {
      addToast({ type: 'success', message: 'Empleado invitado correctamente.', duration: 4000 });
      await loadUsers();
    }
    return result;
  }, [addToast, loadUsers]);

  const userColumns: Column<UserRole>[] = [
    { key: 'name', header: 'Nombre', render: (u) => u.name || u.email || '—' },
    {
      key: 'email', header: 'Email', hideOnMobile: true, render: (u) => u.email || '—',
    },
    {
      key: 'role',
      header: 'Rol',
      render: (u) => {
        if (u.role === 'owner') return <Badge variant="info">Propietario</Badge>;
        return <Badge variant="neutral">{u.role}</Badge>;
      },
    },
  ];

  const registerColumns: Column<DexieRegisterConfig>[] = [
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
  ];

  return (
    <div className="space-y-8">
      <Card>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-primary" />
              <h2 className="text-lg font-semibold text-gray-900">Empleados</h2>
              <span className="text-sm text-gray-500">({users.length})</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="min-h-11"
              onClick={() => setShowAddEmployee(true)}
            >
              <Plus size={16} />
              <span className="hidden sm:inline ml-1">Invitar empleado</span>
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

      <Card>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShoppingBag size={20} className="text-primary" />
              <h2 className="text-lg font-semibold text-gray-900">Cajas</h2>
              <span className="text-sm text-gray-500">({registers.length})</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="min-h-11"
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
        tenantName={users.find((u) => u.role === 'owner')?.name || ''}
        onAddEmployee={handleAddEmployee}
        roles={roles}
      />

      <RegisterManagerModal
        isOpen={showRegisterManager}
        onClose={() => setShowRegisterManager(false)}
        tenantId={tenantId}
      />
    </div>
  );
}
