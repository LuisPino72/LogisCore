import { useState, useEffect } from 'react';
import { Truck, Phone, Building2, FileText } from 'lucide-react';
import { Button, Input, Modal, CedulaInput } from '../../../common/components';
import { formatPhone, unformatPhone } from '../../../lib/utils';
import { useToastStore } from '../../../stores/toastStore';
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
  const [rif, setRif] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (isOpen) {
      setName(editSupplier?.name ?? '');
      setRif(editSupplier?.rif ?? '');
      setPhone(editSupplier?.phone ?? '');
      setError('');
      setFieldErrors({});
    }
  }, [isOpen, editSupplier]);

  const handleSubmit = async () => {
    const payload = {
      name: String(name).trim(),
      rif: String(rif).trim() ? String(rif).trim().toUpperCase() : undefined,
      phone: String(phone).trim() || undefined,
      balance: 0,
    };
    const parsed = CreateSupplierInputSchema.safeParse(payload);
    if (!parsed.success) {
      const newFieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string;
        newFieldErrors[field] = issue.message;
      }
      setFieldErrors(newFieldErrors);
      const msg = parsed.error.issues[0]?.message || 'Revisa los datos ingresados';
      setError(msg);
      return;
    }
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    const ok = await onSubmit(payload);
    setSubmitting(false);
    if (ok) {
      setName('');
      setRif('');
      setPhone('');
      onClose();
    } else {
      const errMsg = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.';
      setError(errMsg);
      addToast({ type: 'error', message: errMsg, duration: 5000 });
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
        <div className="flex items-center gap-3 p-3 rounded-lg bg-linear-to-r from-primary/5 to-primary/10 border border-primary/10">
          <div className="w-10 h-10 rounded-lg bg-linear-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
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
          error={fieldErrors.name}
          validation={{ required: 'Ingresa el nombre del proveedor', maxLength: 25 }}
          inputClassName="text-sm"
        />

        <CedulaInput
          label={<span className="flex items-center gap-2"><FileText size={14} className="text-text-muted" /> RIF <span className="text-text-muted font-normal">(opcional)</span></span>}
          value={rif}
          onChange={setRif}
          hint="V/E/J/G/P + 9 dígitos. Ej: J123456789"
          error={fieldErrors.rif}
          maxLength={9}
        />

        <Input
          label={<span className="flex items-center gap-2"><Phone size={14} className="text-text-muted" /> Teléfono <span className="text-text-muted font-normal">(opcional)</span></span>}
          placeholder="Ej: 0412-1234567"
          value={formatPhone(phone)}
          onChange={(e) => { const formatted = formatPhone(e.target.value); setPhone(unformatPhone(formatted)); }}
          error={fieldErrors.phone}
          validation={{ pattern: /^(\+58|0)\d{10}$/, maxLength: 13 }}
          hint="Formato: 0412-1234567"
          inputClassName="text-sm"
          inputMode="tel"
          autoComplete="tel"
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
