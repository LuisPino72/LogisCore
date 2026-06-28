import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, Trash2 } from 'lucide-react';
import { Modal, Button, Badge, SearchableSelect } from './index';
import { getAllKnownPermissions, type UserPermissionOverride, type CreateOverrideInput } from '../../specs/roles';
import { userPermissionOverrideService } from '../../features/auth/services/userPermissionOverrideService';
import { useAuthStore } from '../../features/auth/stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { handleServiceError } from '../utils/handleServiceError';

interface UserOverridesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  onUpdate?: () => void;
}

const permissionOptions = getAllKnownPermissions().map((p) => ({ value: p, label: p }));

export function UserOverridesModal({ isOpen, onClose, userId, userName, onUpdate }: UserOverridesModalProps) {
  const { addToast } = useToastStore();
  const session = useAuthStore((s) => s.session);
  const tenantId = session?.tenantId ?? '';

  const [overrides, setOverrides] = useState<UserPermissionOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [newPermission, setNewPermission] = useState('');
  const [newEffect, setNewEffect] = useState<'allow' | 'deny'>('allow');
  const [adding, setAdding] = useState(false);

  const loadOverrides = useCallback(async () => {
    if (!userId || !isOpen) return;
    setLoading(true);
    const result = await userPermissionOverrideService.getOverrides(userId);
    if (result.ok) {
      setOverrides(result.data as UserPermissionOverride[]);
    }
    setLoading(false);
  }, [userId, isOpen]);

  useEffect(() => {
    loadOverrides();
    setNewPermission('');
    setNewEffect('allow');
  }, [loadOverrides]);

  const handleAdd = useCallback(async () => {
    if (!newPermission || !tenantId) return;
    setAdding(true);
    const input: CreateOverrideInput = {
      userId,
      tenantId,
      permission: newPermission,
      effect: newEffect,
    };
    const result = await userPermissionOverrideService.addOverride(input);
    if (result.ok) {
      addToast({ type: 'success', message: 'Permiso individual actualizado.', duration: 3000 });
      await loadOverrides();
      setNewPermission('');
      setNewEffect('allow');
      onUpdate?.();
    } else {
      handleServiceError(result);
    }
    setAdding(false);
  }, [newPermission, newEffect, userId, tenantId, addToast, loadOverrides, onUpdate]);

  const handleRemove = useCallback(async (id: string) => {
    const result = await userPermissionOverrideService.removeOverride(id);
    if (result.ok) {
      addToast({ type: 'success', message: 'Permiso eliminado.', duration: 3000 });
      setOverrides((prev) => prev.filter((o) => o.id !== id));
      onUpdate?.();
    } else {
      handleServiceError(result);
    }
  }, [addToast, onUpdate]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Permisos — ${userName}`}
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Shield size={16} />
          <span>Permisos individuales que se superponen sobre el rol base.</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : overrides.length > 0 ? (
          <div className="space-y-2">
            {overrides.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <code className="text-sm font-mono truncate">{o.permission}</code>
                  <Badge variant={o.effect === 'allow' ? 'success' : 'danger'}>
                    {o.effect === 'allow' ? 'Permitir' : 'Denegar'}
                  </Badge>
                </div>
                <Button
                  variant="ghost-danger"
                  size="sm"
                  className="min-h-11 min-w-11 shrink-0"
                  aria-label={`Eliminar ${o.permission}`}
                  onClick={() => handleRemove(o.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No hay permisos individuales configurados.
          </p>
        )}

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Agregar permiso</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <SearchableSelect
                value={newPermission}
                onChange={setNewPermission}
                options={permissionOptions}
                placeholder="Seleccionar permiso..."
                searchPlaceholder="Buscar permiso..."
              />
            </div>
            <select
              className="select text-sm py-2.5 px-3 min-h-11 min-w-[120px]"
              value={newEffect}
              onChange={(e) => setNewEffect(e.target.value as 'allow' | 'deny')}
            >
              <option value="allow">Permitir</option>
              <option value="deny">Denegar</option>
            </select>
            <Button
              variant="primary"
              size="sm"
              className="min-h-11 shrink-0"
              disabled={!newPermission || adding}
              onClick={handleAdd}
            >
              <Plus size={16} className="mr-1" />
              Agregar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
