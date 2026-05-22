import { useState, useCallback, useEffect } from 'react';
import { type Result, type AppError } from '@logiscore/core';
import { Modal, Input, Button } from '../../../common/components';

interface EmployeeForm {
  email: string;
  password: string;
  name: string;
}

const emptyEmployee: EmployeeForm = { email: '', password: '', name: '' };

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  tenantName: string;
  onAddEmployee: (payload: { email: string; password: string; name: string; tenantId: string }) => Promise<Result<{ id: string; email: string; name: string }, AppError>>;
}

export function AddEmployeeModal({ isOpen, onClose, tenantId, tenantName, onAddEmployee }: AddEmployeeModalProps) {
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

    if (!employee.email || !employee.password || !employee.name) {
      setError('Todos los campos del empleado son obligatorios');
      return;
    }

    setIsSubmitting(true);
    const result = await onAddEmployee({ ...employee, tenantId });
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
      <div className="space-y-4">
        <Input
          placeholder="Nombre"
          value={employee.name}
          onChange={(e) => setEmployee((p) => ({ ...p, name: e.target.value }))}
          validation={{ required: true, maxLength: 25 }}
        />
        <Input
          placeholder="Email"
          type="email"
          value={employee.email}
          onChange={(e) => setEmployee((p) => ({ ...p, email: e.target.value }))}
          validation={{ required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }}
        />
        <Input
          placeholder="Contraseña"
          type="password"
          showPassword
          value={employee.password}
          onChange={(e) => setEmployee((p) => ({ ...p, password: e.target.value }))}
          validation={{ required: true, minLength: 8, maxLength: 14 }}
        />
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
