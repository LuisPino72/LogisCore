import { useState, useEffect } from 'react';
import { type Result, type AppError } from '@logiscore/core';
import { UserPlus } from 'lucide-react';
import { Modal, Input, Button } from '../../../common/components';
import { sanitizeValue } from '../../../lib/validation';
import { formatPhone, unformatPhone } from '../../../lib/utils';
import { UpdateTenantSchema, type Tenant } from '../types';

interface EditForm {
  name: string;
  rif: string;
  direccion: string;
  telefono: string;
}

interface EditTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  onSave: (id: string, data: EditForm) => Promise<Result<Tenant, AppError>>;
  onAddEmployeeClick: () => void;
}

export function EditTenantModal({ isOpen, onClose, tenant, onSave, onAddEmployeeClick }: EditTenantModalProps) {
  const [editForm, setEditForm] = useState<EditForm>({ name: '', rif: '', direccion: '', telefono: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (tenant) {
      setEditForm({
        name: tenant.name,
        rif: tenant.rif,
        direccion: tenant.direccion ?? '',
        telefono: tenant.telefono ?? '',
      });
      setError(null);
    }
  }, [tenant?.id, tenant?.name, tenant?.rif, tenant?.direccion, tenant?.telefono]);

  const handleSave = async () => {
    if (!tenant) return;
    const parsed = UpdateTenantSchema.safeParse(editForm);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await onSave(tenant.id, editForm);
    setIsSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Editar local"
    >
      <div className="space-y-4">
        <Input
          placeholder="Nombre"
          value={editForm.name}
          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
          validation={{ required: true, maxLength: 25 }}
          autoComplete="organization"
        />
        <Input
          placeholder="RIF (J123456789)"
          value={editForm.rif}
          sanitize="rif"
          onChange={(e) => setEditForm((p) => ({ ...p, rif: sanitizeValue(e.target.value, 'rif') }))}
          validation={{ required: true, pattern: /^[VJEGP]\d{9}$/, maxLength: 12 }}
          autoComplete="off"
        />
        <Input
          placeholder="Teléfono (0412-1234567)"
          value={formatPhone(editForm.telefono)}
          onChange={(e) => { const formatted = formatPhone(e.target.value); setEditForm((p) => ({ ...p, telefono: unformatPhone(formatted) })); }}
          validation={{ pattern: /^(\+58|0)\d{10}$/, maxLength: 13 }}
          inputMode="tel"
          autoComplete="tel"
        />
        <Input
          placeholder="Dirección"
          value={editForm.direccion}
          onChange={(e) => setEditForm((p) => ({ ...p, direccion: e.target.value }))}
          validation={{ maxLength: 25 }}
          autoComplete="street-address"
        />
        <div className="border-t border-gray-100 pt-3">
          <Button variant="secondary" fullWidth onClick={onAddEmployeeClick}>
            <UserPlus size={16} /> Agregar empleado
          </Button>
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-2">
          <Button variant="primary" fullWidth onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
