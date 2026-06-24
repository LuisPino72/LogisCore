import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { Button, Input, Modal, Select, Spinner } from '../../../common/components';
import { useAdminPanel } from '../hooks/useAdminPanel';
import { ALL_MODULES, CRUD_ACTIONS, SPECIAL_ACTIONS } from '../../../specs/roles';
import { useToastStore } from '../../../stores/toastStore';
import type { Role } from '../../../specs/roles';

interface Props {
  role: Role | null;
  onClose: () => void;
}

export function RoleFormModal({ role, onClose }: Props) {
  const { createRole, updateRole, upsertRolePermissions, fetchRolePermissions } = useAdminPanel();
  const addToast = useToastStore((s) => s.addToast);

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [rlsTier, setRlsTier] = useState<string>(role?.rlsTier ?? 'employee');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(true);

  useEffect(() => {
    if (role) {
      setLoadingPerms(true);
      fetchRolePermissions(role.id).then((result) => {
        if (result.ok) {
          setSelectedPermissions(new Set(result.data));
        }
        setLoadingPerms(false);
      });
    } else {
      setLoadingPerms(false);
    }
  }, [role, fetchRolePermissions]);

  const togglePermission = (perm: string) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) {
        next.delete(perm);
      } else {
        next.add(perm);
      }
      return next;
    });
  };

  const toggleModuleCrud = (module: string, checked: boolean) => {
    const perms = CRUD_ACTIONS.map((a) => `${module}:${a}`);
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (checked) next.add(p);
        else next.delete(p);
      }
      return next;
    });
  };

  const isModuleCrudFullySelected = (module: string): boolean => {
    return CRUD_ACTIONS.every((a) => selectedPermissions.has(`${module}:${a}`));
  };

  const getModuleActions = (module: string): string[] => {
    const crud = module === 'admin' || module === 'reports' || module === 'dashboard'
      ? []
      : CRUD_ACTIONS.map((a) => `${module}:${a}`);
    const special = (SPECIAL_ACTIONS[module] ?? []).map((a) => `${module}:${a}`);
    return [...crud, ...special];
  };

  const handleSave = async () => {
    if (!name.trim()) {
      addToast({ type: 'error', message: 'El nombre del rol es requerido' });
      return;
    }

    setSaving(true);

    if (role) {
      const updateResult = await updateRole(role.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        rlsTier: rlsTier as 'admin' | 'owner' | 'employee',
      });

      if (!updateResult.ok) {
        addToast({ type: 'error', message: updateResult.error.message });
        setSaving(false);
        return;
      }

      const permResult = await upsertRolePermissions(role.id, Array.from(selectedPermissions));
      if (!permResult.ok) {
        addToast({ type: 'error', message: permResult.error.message });
        setSaving(false);
        return;
      }

      addToast({ type: 'success', message: 'Rol actualizado' });
    } else {
      const result = await createRole({
        name: name.trim(),
        description: description.trim() || undefined,
        rlsTier: rlsTier as 'admin' | 'owner' | 'employee',
        permissions: Array.from(selectedPermissions),
      });

      if (!result.ok) {
        addToast({ type: 'error', message: result.error.message });
        setSaving(false);
        return;
      }

      addToast({ type: 'success', message: 'Rol creado' });
    }

    setSaving(false);
    onClose();
  };

  if (loadingPerms) {
    return (
      <Modal isOpen title="Cargando..." onClose={onClose}>
        <div className="p-6 flex justify-center"><Spinner /></div>
      </Modal>
    );
  }

  return (
    <Modal isOpen title={role ? 'Editar Rol' : 'Crear Nuevo Rol'} onClose={onClose}>
      <div className="p-4 sm:p-6 space-y-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{role ? 'Editar Rol' : 'Crear Nuevo Rol'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <Input
            label="Nombre del rol"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Cajero, Supervisor, …"
            maxLength={50}
          />
          <Input
            label="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve descripción del rol"
            maxLength={200}
          />
          <Select
            label="Nivel de acceso en base de datos"
            value={rlsTier}
            onChange={(e) => setRlsTier(e.target.value)}
          >
            <option value="employee">Empleado — solo lectura de su tenant</option>
            <option value="owner">Dueño — acceso completo a su tenant</option>
            <option value="admin">Admin — acceso global (solo para super-admins)</option>
          </Select>
        </div>

        <div>
          <h4 className="font-medium text-sm mb-3">Permisos por módulo</h4>
          <div className="space-y-1">
            {ALL_MODULES.map((module) => {
              const actions = getModuleActions(module);
              const hasCrud = CRUD_ACTIONS.some((a) => actions.includes(`${module}:${a}`));
              return (
                <div key={module} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                    <span className="font-medium text-sm capitalize">{module}</span>
                    {hasCrud && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isModuleCrudFullySelected(module)}
                          onChange={(e) => toggleModuleCrud(module, e.target.checked)}
                          className="rounded"
                        />
                        CRUD completo
                      </label>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-2">
                    {actions.map((perm) => {
                      const action = perm.split(':')[1];
                      const isSpecial = !CRUD_ACTIONS.includes(action as typeof CRUD_ACTIONS[number]);
                      return (
                        <button
                          key={perm}
                          onClick={() => togglePermission(perm)}
                          className={`
                            inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                            transition-all active:scale-95
                            ${selectedPermissions.has(perm)
                              ? 'bg-primary/10 text-primary border border-primary/30'
                              : 'bg-gray-100 text-gray-500 border border-transparent hover:bg-gray-200'
                            }
                            ${isSpecial ? 'ring-1 ring-amber-200' : ''}
                          `}
                        >
                          {selectedPermissions.has(perm) && <Check size={10} />}
                          {action.replace(/_/g, ' ')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Acciones con borde ámbar son acciones especiales del módulo
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : role ? 'Guardar Cambios' : 'Crear Rol'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
