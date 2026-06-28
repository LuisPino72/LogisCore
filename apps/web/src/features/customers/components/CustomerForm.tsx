import { useState, useEffect, useCallback } from 'react';
import { Users, Phone, CreditCard, IdCard } from 'lucide-react';
import { Button, Input, Modal, CedulaInput, Textarea } from '../../../common/components';
import { sanitizeValue } from '../../../lib/validation';
import { formatPhone, unformatPhone } from '../../../lib/utils';
import { useToastStore } from '../../../stores/toastStore';
import {
  CreateCustomerInputSchema,
} from '../../../specs/customers';
import type { CreateCustomerInput, Customer } from '../../../specs/customers';
import { handleServiceError } from '../../../common/utils/handleServiceError';
import { useCustomerStore } from '../stores/customerStore';
import { createAppError } from '@logiscore/core';

interface CustomerFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCustomerInput) => Promise<boolean>;
  editCustomer?: Customer | null;
}

const EMPTY_FORM = { name: '', cedula: '', phone: '', address: '', creditLimit: '', notes: '' };

export function CustomerForm({ isOpen, onClose, onSubmit, editCustomer }: CustomerFormProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: String(editCustomer?.name ?? ''),
        cedula: String(editCustomer?.cedula ?? ''),
        phone: String(editCustomer?.phone ?? ''),
        address: String(editCustomer?.address ?? ''),
        creditLimit: editCustomer?.creditLimit ? String(editCustomer.creditLimit) : '',
        notes: String(editCustomer?.notes ?? ''),
      });
      setFieldErrors({});
    }
  }, [isOpen, editCustomer]);

  const updateField = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }, []);

  const handleSubmit = async () => {
    const creditLimitNum = formData.creditLimit ? Number(formData.creditLimit) : 0;
    const payload = {
      name: formData.name.trim(),
      cedula: formData.cedula.trim().toUpperCase() || undefined,
      phone: formData.phone.trim() || undefined,
      address: formData.address.trim() || undefined,
      creditLimit: creditLimitNum,
      notes: formData.notes.trim() || undefined,
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
      setFormData(EMPTY_FORM);
      onClose();
    } else {
      const storeError = useCustomerStore.getState().error;
      const errResult: import('@logiscore/core').Result<null> = { ok: false, error: createAppError({ code: 'CUSTOMER_SAVE_FAILED', message: storeError || 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.' }) };
      handleServiceError(errResult);
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
          <Button variant="ghost" fullWidth onClick={onClose} className="transition-transform hover:scale-[1.02] active:scale-[0.98]">Cancelar</Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting} className="shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all">
            {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-linear-to-br from-primary/10 to-primary/5 border border-primary/20 shadow-sm animate-fade-in">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
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

        <div className="customer-field">
          <Input
            label={<span className="flex items-center gap-2 group"><Users size={14} className="text-text-muted group-hover:text-primary transition-colors" /> Nombre del cliente</span>}
            placeholder="Ej: Juan Pérez"
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            error={fieldErrors.name}
            validation={{ required: 'Ingresa el nombre del cliente', maxLength: 25 }}
            inputClassName="text-sm"
            autoComplete="name"
          />
        </div>

        <div className="customer-field">
          <CedulaInput
            label={<span className="flex items-center gap-2 group"><IdCard size={14} className="text-text-muted group-hover:text-primary transition-colors" /> Cédula / RIF <span className="text-text-muted font-normal">(opcional)</span></span>}
            value={formData.cedula}
            onChange={(val) => updateField('cedula', val)}
            error={fieldErrors.cedula}
            hint="V/E/J/G/P + 6 a 8 dígitos. Facilita búsqueda."
          />
        </div>

        <div className="customer-field">
          <Input
            label={<span className="flex items-center gap-2 group"><Phone size={14} className="text-text-muted group-hover:text-primary transition-colors" /> Teléfono <span className="text-text-muted font-normal">(opcional)</span></span>}
            placeholder="Ej: 0412-1234567"
            value={formatPhone(formData.phone)}
            onChange={(e) => {
              const formatted = formatPhone(e.target.value);
              updateField('phone', unformatPhone(formatted));
            }}
            error={fieldErrors.phone}
            validation={{ pattern: /^$|^0\d{10}$/, maxLength: 13 }}
            hint="Formato: 0412-1234567"
            inputClassName="text-sm"
            inputMode="tel"
            autoComplete="tel"
          />
        </div>

        <div className="customer-field">
          <Textarea
            label="Dirección (opcional)"
            value={formData.address}
            onChange={(e) => updateField('address', e.target.value)}
            placeholder="Ej: Calle 123, Caracas"
            rows={2}
            validation={{ maxLength: 30 }}
            error={fieldErrors.address}
            autoComplete="street-address"
          />
        </div>

        <div className="customer-field">
          <Input
            label={<span className="flex items-center gap-2 group"><CreditCard size={14} className="text-text-muted group-hover:text-primary transition-colors" /> Límite de crédito <span className="text-text-muted font-normal">(USD, opcional)</span></span>}
            placeholder="Ej: 100"
            value={formData.creditLimit}
            sanitize="currency"
            onChange={(e) => updateField('creditLimit', sanitizeValue(e.target.value, 'currency'))}
            error={fieldErrors.creditLimit}
            validation={{ min: 0, max: 9999.99, maxLength: 10 }}
            hint="Monto máximo de crédito que puede deber este cliente"
            inputClassName="text-sm"
            inputMode="decimal"
            autoComplete="off"
          />
        </div>

        <div className="customer-field">
          <Textarea
            label="Notas (opcional)"
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Ej: Prefiere empanadas los viernes"
            rows={2}
            validation={{ maxLength: 30 }}
            error={fieldErrors.notes}
            autoComplete="off"
          />
        </div>

        {fieldErrors.form && (
          <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger animate-slide-down">
            {fieldErrors.form}
          </div>
        )}
      </div>
    </Modal>
  );
}
