import { useState, useEffect } from 'react';
import { Users, Phone, MapPin, CreditCard, FileText } from 'lucide-react';
import { Button, Input, Modal } from '../../../common/components';
import { sanitizeValue } from '../../../lib/validation';
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
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(editCustomer?.name ?? '');
      setPhone(editCustomer?.phone ?? '');
      setAddress(editCustomer?.address ?? '');
      setCreditLimit(editCustomer?.creditLimit ? String(editCustomer.creditLimit) : '');
      setNotes(editCustomer?.notes ?? '');
      setError('');
    }
  }, [isOpen, editCustomer]);

  const handleSubmit = async () => {
    const creditLimitNum = creditLimit ? Number(creditLimit) : 0;
    const payload = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      creditLimit: creditLimitNum,
      notes: notes.trim() || undefined,
    };
    const parsed = CreateCustomerInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados');
      return;
    }
    setSubmitting(true);
    setError('');
    const ok = await onSubmit(parsed.data as CreateCustomerInput);
    setSubmitting(false);
    if (ok) {
      setName('');
      setPhone('');
      setAddress('');
      setCreditLimit('');
      setNotes('');
      onClose();
    } else {
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
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
          onChange={(e) => setName(e.target.value)}
          error={error && !name.trim() ? error : undefined}
          validation={{ required: 'Ingresa el nombre del cliente', maxLength: 25 }}
          inputClassName="text-sm"
        />

        <Input
          label={<span className="flex items-center gap-2"><Phone size={14} className="text-text-muted" /> Teléfono <span className="text-text-muted font-normal">(opcional)</span></span>}
          placeholder="Ej: 0412-1234567"
          value={phone}
          sanitize="phone"
          onChange={(e) => setPhone(sanitizeValue(e.target.value, 'phone'))}
          validation={{ pattern: /^$|^0\d{10}$/, maxLength: 13 }}
          hint="Formato: 04121234567"
          inputClassName="text-sm"
        />

        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1.5">
            <MapPin size={14} className="text-text-muted" /> Dirección <span className="text-text-muted font-normal">(opcional)</span>
          </label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value.slice(0, 30))}
            placeholder="Ej: Calle 123, Caracas"
            className="textarea w-full"
            rows={2}
            maxLength={30}
          />
          <p className="text-xs text-gray-500 mt-1">{address.length}/30 caracteres</p>
        </div>

        <Input
          label={<span className="flex items-center gap-2"><CreditCard size={14} className="text-text-muted" /> Límite de crédito <span className="text-text-muted font-normal">(USD, opcional)</span></span>}
          placeholder="Ej: 100"
          value={creditLimit}
          sanitize="currency"
          onChange={(e) => setCreditLimit(sanitizeValue(e.target.value, 'currency'))}
          validation={{ min: 0, maxLength: 10 }}
          hint="Monto máximo de crédito que puede deber este cliente"
          inputClassName="text-sm"
        />

        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1.5">
            <FileText size={14} className="text-text-muted" /> Notas <span className="text-text-muted font-normal">(opcional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 30))}
            placeholder="Ej: Prefiere empanadas los viernes"
            className="textarea w-full"
            rows={2}
            maxLength={30}
          />
          <p className="text-xs text-gray-500 mt-1">{notes.length}/30 caracteres</p>
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
