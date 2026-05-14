import { useState, useEffect } from 'react';
import { Button, Input, Modal } from '../../../common/components';
import type { CreateSupplierInput, Supplier } from '../../../specs/purchases';

interface SupplierFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateSupplierInput) => Promise<boolean>;
  editSupplier?: Supplier | null;
}

export function SupplierForm({ isOpen, onClose, onSubmit, editSupplier }: SupplierFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(editSupplier?.name ?? '');
      setPhone(editSupplier?.phone ?? '');
      setError('');
    }
  }, [isOpen, editSupplier]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Nombre es obligatorio');
      return;
    }
    setSubmitting(true);
    setError('');
    const ok = await onSubmit({ name: name.trim(), phone: phone.trim() || undefined });
    setSubmitting(false);
    if (ok) {
      setName('');
      setPhone('');
      onClose();
    } else {
      setError('Error al guardar proveedor');
    }
  };

  const isEditing = !!editSupplier;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar proveedor' : 'Nuevo proveedor'}>
      <div className="space-y-4">
        <div className="input-wrapper">
          <label className="input-label">Nombre</label>
          <Input
            placeholder="Ej: Distribuidora XYZ"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error && !name.trim() ? error : undefined}
            inputClassName="text-sm px-2 py-2"
          />
        </div>
        <div className="input-wrapper">
          <label className="input-label">Teléfono</label>
          <Input
            placeholder="Ej: 0412-1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputClassName="text-sm px-2 py-2"
          />
        </div>
        {error && name.trim() && <p className="text-xs text-danger">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear proveedor'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
