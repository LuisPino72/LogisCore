import { useState, useEffect } from 'react';
import { Users, Phone, CreditCard, IdCard } from 'lucide-react';
import { Button, Input, Modal, CedulaInput, Textarea } from '../../../common/components';
import { sanitizeValue } from '../../../lib/validation';
import { formatPhone, unformatPhone } from '../../../lib/utils';
import { useToastStore } from '../../../stores/toastStore';
import {
  CreateCustomerInputSchema,
} from '../../../specs/customers';
import type { CreateCustomerInput, Customer } from '../../../specs/customers';

interface CustomerFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCustomerInput) => Promise<boolean>;
  editCustomer?: Customer | null;
}

export function CustomerForm({ isOpen, onClose, onSubmit, editCustomer }: CustomerFormProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [name, setName] = useState('');
  const [cedula, setCedula] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(String(editCustomer?.name ?? ''));
      setCedula(String(editCustomer?.cedula ?? ''));
      setPhone(String(editCustomer?.phone ?? ''));
      setAddress(String(editCustomer?.address ?? ''));
      setCreditLimit(editCustomer?.creditLimit ? String(editCustomer.creditLimit) : '');
      setNotes(String(editCustomer?.notes ?? ''));
      setFieldErrors({});
    }
  }, [isOpen, editCustomer]);

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  };

  const handleSubmit = async () => {
    const creditLimitNum = creditLimit ? Number(creditLimit) : 0;
    const nameStr = String(name);
    const cedulaStr = String(cedula);
    const phoneStr = String(phone);
    const addressStr = String(address);
    const notesStr = String(notes);
    const payload = {
      name: nameStr.trim(),
      cedula: cedulaStr.trim().toUpperCase() || undefined,
      phone: phoneStr.trim() || undefined,
      address: addressStr.trim() || undefined,
      creditLimit: creditLimitNum,
      notes: notesStr.trim() || undefined,
    };
    const parsed = CreateCustomerInputSchema.safeParse(payload);
    if (!parsed.success) {
      const zodErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
        zodErrors[field] = issue.message;
      });
      setFieldErrors(zodErrors);
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    const ok = await onSubmit(parsed.data as CreateCustomerInput);
    setSubmitting(false);
    if (ok) {
      addToast({ type: 'success', message: editCustomer ? 'Cliente actualizado correctamente' : 'Cliente creado correctamente', duration: 3000 });
      setName('');
      setCedula('');
      setPhone('');
      setAddress('');
      setCreditLimit('');
      setNotes('');
      onClose();
    } else {
      setFieldErrors({ form: 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.' });
    }
  };

  const isEditing = !!editCustomer;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar cliente' : 'Nuevo cliente'}
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Users size={20} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">
              {isEditing ? 'Editando cliente' : 'Registrar cliente'}
            </p>
            <p className="text-xs text-text-secondary">
              {isEditing ? 'Actualiza los datos del cliente' : 'Agrega un nuevo cliente a tu lista'}
            </p>
          </div>
        </div>

        <Input
          label={<span className="flex items-center gap-2"><Users size={14} className="text-text-muted" /> Nombre del cliente</span>}
          placeholder="Ej: Juan Pérez"
          value={name}
          onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
          error={fieldErrors.name}
          validation={{ required: 'Ingresa el nombre del cliente', maxLength: 25 }}
          inputClassName="text-sm"
          autoComplete="name"
        />

        <CedulaInput
          label={<span className="flex items-center gap-2"><IdCard size={14} className="text-text-muted" /> Cédula / RIF <span className="text-text-muted font-normal">(opcional)</span></span>}
          value={cedula}
          onChange={(val) => { setCedula(val); clearFieldError('cedula'); }}
          error={fieldErrors.cedula}
          hint="V/E/J/G/P + 6 a 8 dígitos. Facilita búsqueda."
        />

        <Input
          label={<span className="flex items-center gap-2"><Phone size={14} className="text-text-muted" /> Teléfono <span className="text-text-muted font-normal">(opcional)</span></span>}
          placeholder="Ej: 0412-1234567"
          value={formatPhone(phone)}
          onChange={(e) => {
            const formatted = formatPhone(e.target.value);
            setPhone(unformatPhone(formatted));
            clearFieldError('phone');
          }}
          error={fieldErrors.phone}
          validation={{ pattern: /^$|^0\d{10}$/, maxLength: 13 }}
          hint="Formato: 0412-1234567"
          inputClassName="text-sm"
          inputMode="tel"
          autoComplete="tel"
        />

        <Textarea
          label="Dirección (opcional)"
          value={address}
          onChange={(e) => { setAddress(e.target.value); clearFieldError('address'); }}
          placeholder="Ej: Calle 123, Caracas"
          rows={2}
          validation={{ maxLength: 30 }}
          error={fieldErrors.address}
          autoComplete="street-address"
        />

        <Input
          label={<span className="flex items-center gap-2"><CreditCard size={14} className="text-text-muted" /> Límite de crédito <span className="text-text-muted font-normal">(USD, opcional)</span></span>}
          placeholder="Ej: 100"
          value={creditLimit}
          sanitize="currency"
          onChange={(e) => { setCreditLimit(sanitizeValue(e.target.value, 'currency')); clearFieldError('creditLimit'); }}
          error={fieldErrors.creditLimit}
          validation={{ min: 0, max: 9999.99, maxLength: 10 }}
          hint="Monto máximo de crédito que puede deber este cliente"
          inputClassName="text-sm"
          inputMode="decimal"
          autoComplete="off"
        />

        <Textarea
          label="Notas (opcional)"
          value={notes}
          onChange={(e) => { setNotes(e.target.value); clearFieldError('notes'); }}
          placeholder="Ej: Prefiere empanadas los viernes"
          rows={2}
          validation={{ maxLength: 30 }}
          error={fieldErrors.notes}
          autoComplete="off"
        />

        {fieldErrors.form && (
          <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger">
            {fieldErrors.form}
          </div>
        )}
      </div>
    </Modal>
  );
}
