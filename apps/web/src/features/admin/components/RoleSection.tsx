import { useEffect, useState } from 'react';
import { Shield, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { Button, Card, Badge, Spinner, EmptyState, Modal } from '../../../common/components';
import { useAdminPanel } from '../hooks/useAdminPanel';
import { RoleFormModal } from './RoleFormModal';
import type { Role } from '../../../specs/roles';
import { useToastStore } from '../../../stores/toastStore';
import { handleServiceError } from '../../../common/utils/handleServiceError';

const RLS_TIER_LABELS: Record<string, string> = {
  admin: 'Admin global',
  owner: 'Dueño',
  employee: 'Empleado',
};

const RLS_TIER_COLORS: Record<string, 'danger' | 'warning' | 'info'> = {
  admin: 'danger',
  owner: 'info',
  employee: 'warning',
};

export function RoleSection() {
  const { roles, fetchRoles, deleteRole } = useAdminPanel();
  const addToast = useToastStore((s) => s.addToast);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRoles().finally(() => setLoading(false));
  }, [fetchRoles]);

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingRole(null);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const result = await deleteRole(id);
    if (result.ok) {
      addToast({ type: 'success', message: 'Rol eliminado' });
    } else {
      handleServiceError(result);
    }
    setDeletingId(null);
  };

  if (loading) {
    return (
      <Card>
        <div className="flex justify-center py-12"><Spinner /></div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield size={20} /> Roles y Permisos
          </h3>
          <Button variant="primary" size="sm" onClick={handleCreate}>
            <Plus size={16} /> Nuevo Rol
          </Button>
        </div>

        {roles.length === 0 ? (
          <EmptyState
            icon={<Shield size={32} />}
            title="No hay roles configurados"
            description="Crea un nuevo rol para empezar a gestionar permisos."
          />
        ) : (
          <div className="space-y-2">
            {roles.filter((r) => r.name !== 'admin').map((role) => {
              const roleWithCount = role as Role & { permissionCount?: number };
              return (
                <div
                  key={role.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">
                      <Badge variant={RLS_TIER_COLORS[role.rlsTier] ?? 'warning'}>
                        {RLS_TIER_LABELS[role.rlsTier] ?? role.rlsTier}
                      </Badge>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{role.name}</p>
                      <p className="text-xs text-gray-500">
                        {role.isSystem ? 'Sistema' : 'Custom'} · {roleWithCount.permissionCount ?? 0} permisos
                        {role.description ? ` · ${role.description}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost-primary" size="sm" onClick={() => handleEdit(role)} aria-label="Editar rol">
                      <Pencil size={14} />
                    </Button>
                    {!role.isSystem && (
                      <Button variant="ghost-danger" size="sm" onClick={() => setDeletingId(role.id)} aria-label="Eliminar rol">
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {showForm && (
        <RoleFormModal
          role={editingRole}
          onClose={() => { setShowForm(false); setEditingRole(null); }}
        />
      )}

      <Modal
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        title="Eliminar rol"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-red-600">
            <AlertTriangle size={24} />
            <p className="text-sm text-gray-600">Esta acción no se puede deshacer. Los usuarios con este rol dejarán de tener estos permisos.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>Cancelar</Button>
            <Button variant="danger" size="sm" onClick={() => deletingId && handleDelete(deletingId)}>Eliminar</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
