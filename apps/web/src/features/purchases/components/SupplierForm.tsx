import { useState, useEffect } from 'react';
import { Truck, Phone, Building2 } from 'lucide-react';
import { Button, Input, Modal } from '../../../common/components';
import { sanitizeValue } from '../../../lib/validation';
import { CreateSupplierInputSchema } from '../../../specs/purchases';
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
    const payload = { name: name.trim(), phone: phone.trim() || undefined };
    const parsed = CreateSupplierInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Revisa los datos ingresados');
      return;
    }
    setSubmitting(true);
    setError('');
    const ok = await onSubmit(payload);
    setSubmitting(false);
    if (ok) {
      setName('');
      setPhone('');
      onClose();
    } else {
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
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

        <Input
          label={<span className="flex items-center gap-2"><Building2 size={14} className="text-text-muted" /> Nombre del proveedor</span>}
          placeholder="Ej: Distribuidora XYZ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error && !name.trim() ? error : undefined}
          validation={{ required: 'Ingresa el nombre del proveedor', maxLength: 25 }}
          inputClassName="text-sm"
        />

        <Input
          label={<span className="flex items-center gap-2"><Phone size={14} className="text-text-muted" /> Teléfono <span className="text-text-muted font-normal">(opcional)</span></span>}
          placeholder="Ej: 0412-1234567"
          value={phone}
          sanitize="phone"
          onChange={(e) => setPhone(sanitizeValue(e.target.value, 'phone'))}
          validation={{ pattern: /^(\+58|0)\d{10}$/, maxLength: 13 }}
          hint="Formato: 04121234567"
          inputClassName="text-sm"
        />

        {error && name.trim() && (
          <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
