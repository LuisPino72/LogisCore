import { useState, useCallback } from 'react';
import { type Result, type AppError } from '@logiscore/core';
import { Building2, Shield, UserPlus, Plus, Trash2 } from 'lucide-react';
import { Modal, Input, Button } from '../../../common/components';
import { CreateTenantWithUsersInputSchema } from '../types';
import type { CreateTenantWithUsersInput, CreateTenantResponse } from '../types';

interface EmployeeForm {
  email: string;
  password: string;
  name: string;
}

interface CreateForm {
  tenant: { name: string; rif: string; direccion: string; telefono: string };
  owner: { email: string; password: string; name: string };
  employees: EmployeeForm[];
}

const emptyCreateForm: CreateForm = {
  tenant: { name: '', rif: '', direccion: '', telefono: '' },
  owner: { email: '', password: '', name: '' },
  employees: [],
};

interface CreateTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTenant: (payload: CreateTenantWithUsersInput) => Promise<Result<CreateTenantResponse, AppError>>;
}

export function CreateTenantModal({ isOpen, onClose, onCreateTenant }: CreateTenantModalProps) {
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = useCallback(() => {
    setCreateForm(emptyCreateForm);
    setCreateError(null);
    onClose();
  }, [onClose]);

  const handleCreate = async () => {
    setCreateError(null);
    const parsed = CreateTenantWithUsersInputSchema.safeParse(createForm);
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setIsSubmitting(true);
    const result = await onCreateTenant(parsed.data);
    setIsSubmitting(false);
    if (result.ok) {
      handleClose();
    } else {
      setCreateError(result.error.message);
    }
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Crear nuevo local"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Tenant section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 size={16} className="text-primary" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Datos del Tenant</p>
          </div>
          <Input
            placeholder="Nombre"
            value={createForm.tenant.name}
            onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, name: e.target.value } }))}
            validation={{ required: true, maxLength: 30 }}
          />
          <Input
            placeholder="RIF (J-123456789)"
            value={createForm.tenant.rif}
            onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, rif: e.target.value.toUpperCase() } }))}
            validation={{ required: true, pattern: /^[VJEGP]\d{9}$/ }}
          />
          <Input
            placeholder="Teléfono (04121234567)"
            value={createForm.tenant.telefono}
            onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, telefono: e.target.value } }))}
            validation={{ pattern: /^(\+58|0)\d{10}$/ }}
          />
          <Input
            placeholder="Dirección"
            value={createForm.tenant.direccion}
            onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, direccion: e.target.value } }))}
            validation={{ maxLength: 30 }}
          />
        </div>

        {/* Owner section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Shield size={16} className="text-accent" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Propietario (obligatorio)</p>
          </div>
          <Input
            placeholder="Nombre del owner"
            value={createForm.owner.name}
            onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, name: e.target.value } }))}
            validation={{ required: true, maxLength: 25 }}
          />
          <Input
            placeholder="Email del owner"
            type="email"
            value={createForm.owner.email}
            onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, email: e.target.value } }))}
            validation={{ required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }}
          />
          <Input
            placeholder="Contraseña"
            type="password"
            showPassword
            value={createForm.owner.password}
            onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, password: e.target.value } }))}
            validation={{ required: true, minLength: 8, maxLength: 14 }}
          />
        </div>

        {/* Employees section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <UserPlus size={16} className="text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-gray-700">Empleados (opcional, max 3)</p>
            </div>
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
            <div key={i} className="rounded-lg bg-surface-alt border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Empleado #{i + 1}</span>
                <Button variant="danger" size="sm" onClick={() => removeEmployeeRow(i)}>
                  <Trash2 size={14} />
                </Button>
              </div>
              <Input
                placeholder="Nombre"
                value={emp.name}
                onChange={(e) => updateEmployeeRow(i, 'name', e.target.value)}
                validation={{ maxLength: 25 }}
              />
              <Input
                placeholder="Email"
                type="email"
                value={emp.email}
                onChange={(e) => updateEmployeeRow(i, 'email', e.target.value)}
                validation={{ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }}
              />
              <Input
                placeholder="Contraseña"
                type="password"
                showPassword
                value={emp.password}
                onChange={(e) => updateEmployeeRow(i, 'password', e.target.value)}
                validation={{ minLength: 8, maxLength: 14 }}
              />
            </div>
          ))}
        </div>

        {createError && <p className="text-danger text-sm">{createError}</p>}

        <div className="flex gap-2 pt-2">
          <Button
            variant="primary"
            fullWidth
            onClick={handleCreate}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creando...' : 'Crear Tenant'}
          </Button>
          <Button variant="secondary" fullWidth onClick={handleClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
