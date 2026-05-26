import { useState, useEffect, useRef } from 'react';
import { Button, Input, Modal, Select, Textarea, Toggle } from '@/common/components';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import { CreateGastoInputSchema } from '../../../specs/gastos';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type CreateGastoInput, type Gasto } from '../types';
import { formatBs } from '@/lib/formatBs';

interface GastoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateGastoInput) => Promise<boolean>;
  editGasto?: Gasto | null;
}

export function GastoForm({ isOpen, onClose, onSubmit, editGasto }: GastoFormProps) {
  const exchangeRateStore = useExchangeRateStore();
  const [category, setCategory] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'monthly' | 'yearly'>('monthly');
  const [status, setStatus] = useState<'pending' | 'paid'>('paid');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  const isEditing = !!editGasto;

  const parsedAmount = parseFloat(amountUsd);
  const parsedRate = parseFloat(exchangeRate);
  const bsPreview = !isNaN(parsedAmount) && !isNaN(parsedRate) && parsedAmount > 0 && parsedRate > 0
    ? parsedAmount * parsedRate
    : null;

  const hasUnsavedChanges = category !== '' || amountUsd !== '' || date !== new Date().toISOString().slice(0, 10) || description !== '' || isRecurring;

  const initialValues = useRef<{
    category: string; amountUsd: string; exchangeRate: string; date: string; description: string;
    isRecurring: boolean; recurrenceType: 'monthly' | 'yearly'; status: 'pending' | 'paid';
  }>({
    category: '', amountUsd: '', exchangeRate: '', date: '', description: '',
    isRecurring: false, recurrenceType: 'monthly', status: 'paid',
  });

  useEffect(() => {
    if (isOpen) {
      if (editGasto) {
        setCategory(editGasto.category);
        setAmountUsd(String(editGasto.amountUsd));
        setExchangeRate(String(editGasto.exchangeRate));
        setDate(editGasto.date);
        setDescription(editGasto.description ?? '');
        setIsRecurring(editGasto.isRecurring);
        setRecurrenceType(editGasto.recurrenceType ?? 'monthly');
        setStatus(editGasto.status === 'paid' ? 'paid' : 'pending');
        initialValues.current = {
          category: editGasto.category,
          amountUsd: String(editGasto.amountUsd),
          exchangeRate: String(editGasto.exchangeRate),
          date: editGasto.date,
          description: editGasto.description ?? '',
          isRecurring: editGasto.isRecurring,
          recurrenceType: editGasto.recurrenceType ?? 'monthly',
          status: editGasto.status === 'paid' ? 'paid' : 'pending',
        };
      } else {
        setCategory('');
        setAmountUsd('');
        setExchangeRate(String(exchangeRateStore.rate ?? ''));
        setDate(new Date().toISOString().slice(0, 10));
        setDescription('');
        setIsRecurring(false);
        setRecurrenceType('monthly');
        setStatus('paid');
        initialValues.current = {
          category: '', amountUsd: '', exchangeRate: String(exchangeRateStore.rate ?? ''),
          date: new Date().toISOString().slice(0, 10), description: '',
          isRecurring: false, recurrenceType: 'monthly', status: 'paid',
        };
      }
      setError('');
      setConfirmClose(false);
    }
  }, [isOpen, editGasto, exchangeRateStore.rate]);

  useEffect(() => {
    if (!isEditing && exchangeRateStore.rate && !exchangeRate) {
      setExchangeRate(String(exchangeRateStore.rate));
    }
  }, [exchangeRateStore.rate, isEditing, exchangeRate]);

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
    const payload = {
      category: category as ExpenseCategory,
      amountUsd: parsedAmount,
      exchangeRate: parsedRate,
      date,
      description: description.trim() || undefined,
      isRecurring,
      recurrenceType: isRecurring ? recurrenceType : undefined,
      status,
    };

    const parsed = CreateGastoInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Revisa los datos ingresados');
      return;
    }

    setSubmitting(true);
    setError('');
    const ok = await onSubmit(payload);
    setSubmitting(false);

    if (ok) {
      setConfirmClose(false);
      onClose();
    } else {
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !confirmClose}
        onClose={handleClose}
        title={isEditing ? 'Editar gasto' : 'Nuevo gasto'}
        footer={
          <div className="flex gap-3 w-full">
            <Button variant="ghost" fullWidth onClick={handleClose}>Cancelar</Button>
            <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear gasto'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="Categoría"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            validation={{ required: true }}
          >
            <option value="">Seleccionar categoría</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </Select>

          <Input
            label="Monto (USD)"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            validation={{ required: true, min: 0.01 }}
          />

          <Input
            label="Tasa de cambio (Bs/USD)"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(e.target.value)}
            validation={{ required: true, min: 0.01 }}
          />

          {bsPreview !== null && (
            <div className="flex items-center justify-between bg-accent/5 border border-accent/10 p-3 rounded-lg">
              <span className="text-xs font-medium text-text-secondary">Total en Bs:</span>
              <span className="text-base font-bold text-accent">{formatBs(bsPreview)}</span>
            </div>
          )}

          <Input
            label="Fecha"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            validation={{ required: true }}
          />

          <Textarea
            label="Descripción"
            placeholder="Opcional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            validation={{ maxLength: 200 }}
            autoResize
          />

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-medium text-gray-700">Gasto recurrente</span>
            <Toggle
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
          </div>

          {isRecurring && (
            <Select
              label="Frecuencia"
              value={recurrenceType}
              onChange={(e) => setRecurrenceType(e.target.value as 'monthly' | 'yearly')}
            >
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </Select>
          )}

          <Select
            label="Estado"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'pending' | 'paid')}
          >
            <option value="paid">Pagado</option>
            <option value="pending">Pendiente</option>
          </Select>

          {error && (
            <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger">
              {error}
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={confirmClose} onClose={() => setConfirmClose(false)} title="Descartar cambios">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Tienes cambios sin guardar. ¿Seguro que quieres salir?
          </p>
          <div className="flex gap-3 pt-2">
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
