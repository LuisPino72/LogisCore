import { useState, useEffect } from 'react';
import { Truck, Phone, Building2 } from 'lucide-react';
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear proveedor'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header visual */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Truck size={20} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">
              {isEditing ? 'Editando proveedor' : 'Registrar proveedor'}
            </p>
            <p className="text-xs text-text-secondary">
              {isEditing ? 'Actualiza los datos del proveedor' : 'Agrega un nuevo proveedor a tu lista'}
            </p>
          </div>
        </div>

        <div className="input-wrapper">
          <label className="input-label">Nombre del proveedor</label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Building2 size={16} />
            </div>
            <Input
              placeholder="Ej: Distribuidora XYZ"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={error && !name.trim() ? error : undefined}
              validation={{ required: true, maxLength: 25 }}
              inputClassName="text-sm pl-10"
            />
          </div>
        </div>

        <div className="input-wrapper">
          <label className="input-label">Teléfono <span className="text-text-muted font-normal">(opcional)</span></label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Phone size={16} />
            </div>
            <Input
              placeholder="Ej: 0412-1234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              validation={{ pattern: /^(\+58|0)\d{10}$/, maxLength: 11 }}
              hint="Formato: 04121234567 o +584121234567"
              inputClassName="text-sm pl-10"
            />
          </div>
        </div>

        {error && name.trim() && (
          <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
