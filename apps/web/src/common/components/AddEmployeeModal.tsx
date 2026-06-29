import { useState, useCallback, useEffect } from 'react';
import { type Result, type AppError } from '@logiscore/core';
import { Modal, Input, Button, Select } from '../components';
import { CreateEmployeeInputSchema } from '../../features/admin/types';
import type { Role } from '../../specs/roles';

interface EmployeeForm {
  email: string;
  password: string;
  name: string;
  roleId: string;
}

const emptyEmployee: EmployeeForm = { email: '', password: '', name: '', roleId: '' };

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  tenantName: string;
  onAddEmployee: (payload: unknown) => Promise<Result<{ id: string; email: string; name: string }, AppError>>;
  roles: Role[];
}

export function AddEmployeeModal({ isOpen, onClose, tenantId, tenantName, onAddEmployee, roles }: AddEmployeeModalProps) {
  const [employee, setEmployee] = useState<EmployeeForm>(emptyEmployee);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEmployee(emptyEmployee);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setEmployee(emptyEmployee);
    setError(null);
    onClose();
  }, [onClose]);

  const handleAdd = async () => {
    if (!tenantId) return;
    setError(null);

    const parsed = CreateEmployeeInputSchema.safeParse({
      ...employee,
      tenantId,
      roleId: employee.roleId || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Datos inválidos.');
      return;
    }

    setIsSubmitting(true);
    const result = await onAddEmployee(parsed.data);
    setIsSubmitting(false);

    if (result.ok) {
      handleClose();
    } else {
      setError(result.error.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Agregar empleado a ${tenantName}`}
    >
      <div className="space-y-4 admin-section-reveal">
        <Input
          label="Nombre"
          placeholder="Nombre"
          value={employee.name}
          onChange={(e) => setEmployee((p) => ({ ...p, name: e.target.value }))}
          validation={{ required: true, maxLength: 25 }}
          autoComplete="name"
        />
        <Input
          label="Correo electrónico"
          placeholder="Email"
          type="email"
          value={employee.email}
          onChange={(e) => setEmployee((p) => ({ ...p, email: e.target.value }))}
          validation={{ required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, maxLength: 30 }}
          autoComplete="email"
        />
        <Input
          label="Contraseña"
          placeholder="Contraseña"
          type="password"
          showPassword
          value={employee.password}
          onChange={(e) => setEmployee((p) => ({ ...p, password: e.target.value }))}
          validation={{ required: true, minLength: 8, maxLength: 14 }}
          hint="Mín. 8 caracteres: mayúscula, minúscula, número y símbolo"
          autoComplete="new-password"
        />
        <Select
          label="Rol"
          value={employee.roleId}
          onChange={(e) => setEmployee((p) => ({ ...p, roleId: e.target.value }))}
        >
          <option value="">Seleccionar rol</option>
          {roles
            .filter((r) => !r.isSystem)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </Select>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-2">
          <Button variant="primary" fullWidth onClick={handleAdd} disabled={isSubmitting}>
            {isSubmitting ? 'Agregando...' : 'Agregar'}
          </Button>
          <Button variant="secondary" fullWidth onClick={handleClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
