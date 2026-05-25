import { useState, useEffect } from 'react';
import { Button, Input, Modal, Select, Textarea, Toggle } from '@/common/components';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type CreateGastoInput, type Gasto } from '../types';

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

  const isEditing = !!editGasto;

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
      } else {
        setCategory('');
        setAmountUsd('');
        setExchangeRate(String(exchangeRateStore.rate ?? ''));
        setDate(new Date().toISOString().slice(0, 10));
        setDescription('');
        setIsRecurring(false);
        setRecurrenceType('monthly');
        setStatus('paid');
      }
      setError('');
    }
  }, [isOpen, editGasto, exchangeRateStore.rate]);

  useEffect(() => {
    if (!isEditing && exchangeRateStore.rate && !exchangeRate) {
      setExchangeRate(String(exchangeRateStore.rate));
    }
  }, [exchangeRateStore.rate, isEditing, exchangeRate]);

  const handleSubmit = async () => {
    if (!category) {
      setError('Selecciona una categoría');
      return;
    }
    const parsedAmount = parseFloat(amountUsd);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto válido en USD');
      return;
    }
    const parsedRate = parseFloat(exchangeRate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setError('Ingresa una tasa de cambio válida');
      return;
    }
    if (!date) {
      setError('Selecciona una fecha');
      return;
    }

    setSubmitting(true);
    setError('');

    const ok = await onSubmit({
      category: category as ExpenseCategory,
      amountUsd: parsedAmount,
      exchangeRate: parsedRate,
      date,
      description: description.trim() || undefined,
      isRecurring,
      recurrenceType: isRecurring ? recurrenceType : undefined,
      status,
    });

    setSubmitting(false);

    if (ok) {
      onClose();
    } else {
      setError('Error al guardar el gasto');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar gasto' : 'Nuevo gasto'}
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
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
  );
}
