import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Input, Modal, Select, Textarea, Toggle, SearchableSelect } from '@/common/components';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import { useToastStore } from '../../../stores/toastStore';
import { CreateGastoInputSchema } from '../../../specs/gastos';
import { UI_EXPENSE_CATEGORIES, type ExpenseCategory, type CreateGastoInput } from '../types';
import { formatBs } from '@/lib/formatBs';

interface GastoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateGastoInput) => Promise<boolean>;
}

export function GastoForm({ isOpen, onClose, onSubmit }: GastoFormProps) {
  const rate = useExchangeRateStore((s) => s.rate);
  const addToast = useToastStore((s) => s.addToast);
  const [category, setCategory] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [description, setDescription] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'monthly' | 'yearly'>('monthly');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmClose, setConfirmClose] = useState(false);

  const parsedAmount = parseFloat(amountUsd);
  const currentRate = rate ?? 0;
  const bsPreview = !isNaN(parsedAmount) && parsedAmount > 0 && currentRate > 0
    ? parsedAmount * currentRate
    : null;

  const hasUnsavedChanges = category !== '' || amountUsd !== '' || description !== '' || isRecurring;

  useEffect(() => {
    if (isOpen) {
      setCategory('');
      setAmountUsd('');
      setDescription('');
      setIsRecurring(false);
      setRecurrenceType('monthly');
      setFieldErrors({});
      setConfirmClose(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isOpen, hasUnsavedChanges]);

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  };

  const handleConfirmClose = () => {
    setConfirmClose(false);
    onClose();
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};

    if (!category) {
      newErrors.category = 'Selecciona una categoría';
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      return;
    }

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const currentRate = rate ?? 0;
    const payload = {
      category: category as ExpenseCategory,
      amountUsd: parsedAmount,
      exchangeRate: currentRate,
      date: today,
      description: description.trim() || undefined,
      isRecurring,
      recurrenceType: isRecurring ? recurrenceType : undefined,
      status: 'pending' as const,
    };

    const parsed = CreateGastoInputSchema.safeParse(payload);
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
    const ok = await onSubmit(payload);
    setSubmitting(false);

    if (ok) {
      addToast({ type: 'success', message: 'Gasto creado correctamente', duration: 3000 });
      setConfirmClose(false);
      onClose();
    } else {
      setFieldErrors({ form: 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.' });
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !confirmClose}
        onClose={handleClose}
        title="Nuevo gasto"
        footer={
          <div className="flex gap-3 w-full">
            <Button variant="ghost" fullWidth onClick={handleClose}>Cancelar</Button>
            <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Guardando...' : 'Crear gasto'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="input-wrapper">
            <label className="input-label">
              Categoría <span className="text-danger">*</span>
            </label>
            <div className="max-w-full sm:max-w-xs">
              <SearchableSelect
                value={category}
                onChange={(val) => { setCategory(val); setFieldErrors((prev) => { const next = { ...prev }; delete next.category; return next; }); }}
                placeholder="Seleccionar categoría"
                searchPlaceholder="Buscar categoría..."
                options={UI_EXPENSE_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
              />
            </div>
            {fieldErrors.category && (
              <p className="text-xs text-danger mt-1">{fieldErrors.category}</p>
            )}
          </div>

          <Input
            label="Monto ($)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            sanitize="number"
            placeholder="0.00"
            value={amountUsd}
            onChange={(e) => { setAmountUsd(e.target.value); setFieldErrors((prev) => { const next = { ...prev }; delete next.amountUsd; return next; }); }}
            error={fieldErrors.amountUsd}
            validation={{ required: true, min: 0.01, max: 99999 }}
          />

          {currentRate > 0 && (
            <div className="bg-accent/5 border border-accent/10 p-3 rounded-lg shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Tasa del día</span>
                <span className="text-xs font-semibold text-accent">Bs/{currentRate.toFixed(2)}</span>
              </div>
              {bsPreview !== null && (
                <div className="flex items-center justify-between pt-1 border-t border-accent/10">
                  <span className="text-xs font-medium text-text-secondary">Total en Bs:</span>
                  <span className="text-base font-bold text-accent">{formatBs(bsPreview)}</span>
                </div>
              )}
            </div>
          )}

          <Textarea
            label="Descripción"
            placeholder="Opcional (máx. 35 caracteres)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            validation={{ maxLength: 35 }}
            autoResize
          />

          <div className="flex items-center justify-between pt-2">
            <Toggle
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              label="Gasto recurrente"
            />
          </div>

          {isRecurring && (
            <div className="animate-slide-down">
              <Select
                label="Frecuencia"
                value={recurrenceType}
                onChange={(e) => setRecurrenceType(e.target.value as 'monthly' | 'yearly')}
                className="max-w-full sm:max-w-xs"
              >
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </Select>
            </div>
          )}

          {fieldErrors.form && (
            <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger">
              {fieldErrors.form}
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={confirmClose} onClose={() => setConfirmClose(false)} title="Descartar cambios">
        <div className="flex flex-col items-center gap-3 pt-2 animate-slide-down">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-danger/20 bg-danger/10">
            <AlertTriangle size={24} className="text-danger" />
          </div>
          <p className="text-sm text-gray-600 text-center">
            Tienes cambios sin guardar. ¿Seguro que quieres salir?
          </p>
          <div className="flex gap-3 w-full pt-1">
            <Button variant="ghost" fullWidth onClick={() => setConfirmClose(false)}>
              Seguir editando
            </Button>
            <Button variant="danger" fullWidth onClick={handleConfirmClose}>
              Descartar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
