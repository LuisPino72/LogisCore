import { useState, useEffect, useCallback } from 'react';
import { Shield, ChevronDown, ChevronRight } from 'lucide-react';
import { Modal, Button, Badge, Input, Select, Alert, Checkbox } from './index';
import { adminService } from '../../features/admin/services/adminService';
import { useToastStore } from '../../stores/toastStore';
import { ALL_MODULES, CRUD_ACTIONS, SPECIAL_ACTIONS, type Role } from '../../specs/roles';

interface RolePermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  role?: Role | null;
  onSave?: () => void;
}

function getModulePermissions(mod: string): string[] {
  const crud = mod === 'reports' || mod === 'dashboard' || mod === 'exchange' || mod === 'settings'
    ? []
    : CRUD_ACTIONS.map((a) => `${mod}:${a}`);
  const special = (SPECIAL_ACTIONS[mod] ?? []).map((a) => `${mod}:${a}`);
  return [...crud, ...special];
}

export function RolePermissionsModal({ isOpen, onClose, role, onSave }: RolePermissionsModalProps) {
  const { addToast } = useToastStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rlsTier, setRlsTier] = useState<string>('employee');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(ALL_MODULES));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!role;

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (role) {
      setName(role.name);
      setDescription(role.description ?? '');
      setRlsTier('employee');
      setLoading(true);
      adminService.fetchRolePermissions(role.id).then((result) => {
        if (result.ok) {
          setPermissions(new Set(result.data));
        }
        setLoading(false);
      });
    } else {
      setName('');
      setDescription('');
      setRlsTier('employee');
      setPermissions(new Set());
      setLoading(false);
    }
  }, [isOpen, role]);

  const toggleModule = useCallback((mod: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  }, []);

  const toggleModuleAll = useCallback((mod: string) => {
    const modPerms = getModulePermissions(mod);
    setPermissions((prev) => {
      const next = new Set(prev);
      const allSelected = modPerms.every((p) => next.has(p));
      if (allSelected) {
        modPerms.forEach((p) => next.delete(p));
      } else {
        modPerms.forEach((p) => next.add(p));
      }
      return next;
    });
  }, []);

  const togglePermission = useCallback((perm: string) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isEditing && role) {
        const updateResult = await adminService.updateRole(role.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          rlsTier: 'employee',
        });
        if (!updateResult.ok) {
          setError(updateResult.error.message);
          setLoading(false);
          return;
        }
        const permResult = await adminService.upsertRolePermissions(role.id, Array.from(permissions));
        if (!permResult.ok) {
          setError(permResult.error.message);
          setLoading(false);
          return;
        }
        addToast({ type: 'success', message: 'Rol actualizado correctamente.', duration: 4000 });
      } else {
        const createResult = await adminService.createRole({
          name: name.trim(),
          description: description.trim() || undefined,
          rlsTier: 'employee',
          permissions: Array.from(permissions),
        });
        if (!createResult.ok) {
          setError(createResult.error.message);
          setLoading(false);
          return;
        }
        addToast({ type: 'success', message: 'Rol creado correctamente.', duration: 4000 });
      }
      onSave?.();
      onClose();
    } catch {
      setError('Error inesperado al guardar el rol.');
    } finally {
      setLoading(false);
    }
  }, [name, description, rlsTier, permissions, isEditing, role, addToast, onSave, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar rol' : 'Crear rol'}
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" fullWidth onClick={handleSave} loading={loading}>
            {isEditing ? 'Guardar cambios' : 'Crear rol'}
          </Button>
        </div>
      }
    >
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="space-y-4">
        <Input
          label="Nombre del rol"
          value={name}
          onChange={(e) => setName(e.target.value)}
          validation={{ required: true, maxLength: 50 }}
        />

        <Input
          label="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          validation={{ maxLength: 200 }}
        />

        <Select
          label="Nivel de acceso (RLS Tier)"
          value={rlsTier}
          onChange={(e) => setRlsTier(e.target.value)}
          disabled
        >
          <option value="employee">Employee</option>
        </Select>

        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Permisos</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {ALL_MODULES.map((mod) => {
              const modPerms = getModulePermissions(mod);
              if (modPerms.length === 0) return null;
              const allSelected = modPerms.every((p) => permissions.has(p));
              const someSelected = modPerms.some((p) => permissions.has(p));
              const isExpanded = expandedModules.has(mod);

              return (
                <div key={mod} className="border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-t-lg">
                    <button
                      type="button"
                      onClick={() => toggleModule(mod)}
                      className="flex items-center gap-1 text-sm font-medium text-gray-700"
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <Shield size={14} className="text-gray-500" />
                      {mod}
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      <Badge variant="neutral" className="text-xs">
                        {modPerms.filter((p) => permissions.has(p)).length}/{modPerms.length}
                      </Badge>
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={() => toggleModuleAll(mod)}
                      />
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="p-3 grid grid-cols-2 gap-2">
                      {modPerms.map((perm) => {
                        const action = perm.split(':')[1];
                        return (
                          <Checkbox
                            key={perm}
                            label={action}
                            checked={permissions.has(perm)}
                            onChange={() => togglePermission(perm)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
