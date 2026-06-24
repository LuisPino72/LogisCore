import { useState, useEffect, type FC } from 'react';
import { Settings } from 'lucide-react';
import { Card, Input, Toggle, Button, Textarea, Alert } from '../../../common/components';
import { useAuthStore } from '../../auth/stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { settingsService } from '../services/settingsService';
import { useToastStore } from '../../../stores/toastStore';

interface OperationsTabProps {
  tenantId?: string | null;
}

export const OperationsTab: FC<OperationsTabProps> = ({ tenantId }) => {
  const store = useSettingsStore();
  const { addToast } = useToastStore();
  const userId = useAuthStore((s) => s.session?.userId);

  const [maxDiscountPct, setMaxDiscountPct] = useState('');
  const [defaultMinStock, setDefaultMinStock] = useState('');
  const [defaultCreditLimit, setDefaultCreditLimit] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [ticketFooterMessage, setTicketFooterMessage] = useState('');
  const [mandatoryCustomerId, setMandatoryCustomerId] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setMaxDiscountPct(String(store.maxDiscountPct));
    setDefaultMinStock(String(store.defaultMinStock));
    setDefaultCreditLimit(String(store.defaultCreditLimit));
    setLowStockThreshold(String(store.lowStockThreshold));
    setTicketFooterMessage(store.ticketFooterMessage);
    setMandatoryCustomerId(store.mandatoryCustomerId);
  }, [
    store.maxDiscountPct, store.defaultMinStock, store.defaultCreditLimit,
    store.lowStockThreshold, store.ticketFooterMessage, store.mandatoryCustomerId,
  ]);

  const handleSave = async () => {
    setLocalError(null);

    const discountNum = parseFloat(maxDiscountPct);
    const stockNum = parseFloat(defaultMinStock);
    const creditNum = parseFloat(defaultCreditLimit);
    const thresholdNum = parseFloat(lowStockThreshold);

    if (isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
      setLocalError('El descuento máximo debe estar entre 0% y 100%');
      return;
    }
    if (isNaN(stockNum) || stockNum < 0) {
      setLocalError('El stock mínimo no puede ser negativo');
      return;
    }
    if (isNaN(creditNum) || creditNum < 0) {
      setLocalError('El límite de crédito no puede ser negativo');
      return;
    }
    if (isNaN(thresholdNum) || thresholdNum < 0) {
      setLocalError('El umbral de stock bajo no puede ser negativo');
      return;
    }
    if (ticketFooterMessage.length > 100) {
      setLocalError('Mensaje de pie de ticket demasiado largo (máximo 25 caracteres)');
      return;
    }

    if (!tenantId || !userId) return;
    setSaving(true);

    const result = await settingsService.updateOperationSettings(tenantId, userId, {
      maxDiscountPct: discountNum,
      defaultMinStock: stockNum,
      defaultCreditLimit: creditNum,
      lowStockThreshold: thresholdNum,
      ticketFooterMessage,
      mandatoryCustomerId,
    });

    setSaving(false);

    if (result.ok) {
      useSettingsStore.getState().setOperationSettings(result.data);
      addToast({ type: 'success', message: 'Configuración de operaciones actualizada correctamente' });
    } else {
      setLocalError(result.error.message);
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Settings size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Configuración de Operaciones</h2>
            <p className="text-sm text-gray-500">
              Parámetros generales para el funcionamiento del POS y el inventario.
            </p>
          </div>
        </div>

        {localError && (
          <Alert variant="error" onClose={() => setLocalError(null)}>
            {localError}
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Descuento máximo POS (%)"
            type="number"
            step="1"
            min="0"
            max="100"
            value={maxDiscountPct}
            onChange={(e) => setMaxDiscountPct(e.target.value)}
            hint="Porcentaje máximo de descuento permitido por venta."
          />
          <Input
            label="Stock mínimo por defecto"
            type="number"
            step="1"
            min="0"
            value={defaultMinStock}
            onChange={(e) => setDefaultMinStock(e.target.value)}
            hint="Cantidad mínima sugerida al crear productos."
          />
          <Input
            label="Límite de crédito por defecto ($)"
            type="number"
            step="1"
            min="0"
            value={defaultCreditLimit}
            onChange={(e) => setDefaultCreditLimit(e.target.value)}
            hint="Monto máximo de crédito para clientes nuevos."
          />
          <Input
            label="Umbral de stock bajo"
            type="number"
            step="1"
            min="0"
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value)}
            hint="Cantidad mínima para mostrar alerta de stock bajo."
          />
        </div>

        <Textarea
          label="Mensaje pie de ticket"
          value={ticketFooterMessage}
          onChange={(e) => setTicketFooterMessage(e.target.value)}
          validation={{ maxLength: 25 }}
          hint="Texto que aparece al final del ticket de venta (máx 25 caracteres)."
          autoResize
          maxRows={3}
        />

        <Toggle
          label="Obligar identificación del cliente en ventas"
          checked={mandatoryCustomerId}
          onChange={(e) => setMandatoryCustomerId(e.target.checked)}
        />

        <div className="pt-2">
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            className="min-h-11 transition-all duration-200"
          >
            Guardar cambios
          </Button>
        </div>
      </div>
    </Card>
  );
};
