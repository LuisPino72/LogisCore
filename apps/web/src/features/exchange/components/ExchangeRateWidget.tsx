import { FC, useState } from 'react';
import { DollarSign, RefreshCw, AlertCircle, Settings } from 'lucide-react';
import { Button, Input, Modal, Spinner } from '../../../common/components';
import { useExchangeRate } from '../hooks/useExchangeRate';
import { formatBs } from '@/lib/formatBs';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { useToastStore } from '../../../stores/toastStore';

interface ExchangeRateWidgetProps {
  tenantId: string | null;
  role: string | null;
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 horas
const STALE_CRITICAL_MS = 48 * 60 * 60 * 1000; // 48 horas

export const ExchangeRateWidget: FC<ExchangeRateWidgetProps> = ({ tenantId, role }) => {
  const { rate, source, fetchedAt, loading, isUpdating, error, updateFromBcv, setManual } =
    useExchangeRate(tenantId);
  const { addToast } = useToastStore();
  const [showModal, setShowModal] = useState(false);
  const [manualRate, setManualRate] = useState('');
  const isOnline = useOnlineStatus();
  const [manualError, setManualError] = useState('');

  const isOwner = role === 'owner' || role === 'admin';

  const handleUpdate = async () => {
    if (!tenantId) return;
    await updateFromBcv(tenantId);
  };

  const handleManualSubmit = async () => {
    setManualError('');
    const parsed = parseFloat(manualRate);
    if (isNaN(parsed) || parsed <= 0) {
      setManualError('Ingresa una tasa válida mayor a 0');
      return;
    }
    if (parsed < 10 || parsed > 200) {
      if (!confirm('La tasa ingresada es inusual. ¿Estás seguro de que es correcta?')) {
        return;
      }
    }
    if (!tenantId) return;
    await setManual(tenantId, parsed);
    addToast({ type: 'success', message: `Tasa actualizada a ${formatBs(parsed)} Bs`, duration: 3000 });
    setShowModal(false);
    setManualRate('');
  };

  const formatRate = (val: number | null) => {
    if (val === null) return '-';
    return formatBs(val);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const getRateStatus = (): 'fresh' | 'stale' | 'critical' | 'missing' => {
    if (!rate || !fetchedAt) return 'missing';
    const ageMs = Date.now() - new Date(fetchedAt).getTime();
    if (ageMs > STALE_CRITICAL_MS) return 'critical';
    if (ageMs > STALE_THRESHOLD_MS) return 'stale';
    return 'fresh';
  };

  const rateStatus = getRateStatus();
  const statusStyles = {
    fresh: { color: 'success', label: 'BCV', icon: DollarSign, pulse: false },
    stale: { color: 'warning', label: 'Desactualizada', icon: AlertCircle, pulse: true },
    critical: { color: 'danger', label: 'Desactualizada — toca "Actualizar"', icon: AlertCircle, pulse: true },
    missing: { color: 'danger', label: 'Sin tasa — toca "Cargar tasa AHORA"', icon: AlertCircle, pulse: true },
  } as const;
  const currentStyle = statusStyles[rateStatus];
  const StatusIcon = currentStyle.icon;

  return (
    <>
      <div className="flex flex-col items-center w-full">
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 bg-${currentStyle.color}/10 ring-${currentStyle.color}/20 ${
              currentStyle.pulse ? 'animate-pulse' : ''
            }`}
          >
            <StatusIcon size={14} className={`text-${currentStyle.color}`} />
          </div>
          <span className={`text-base font-title font-bold text-${currentStyle.color}`}>
            {loading ? '-' : formatRate(rate)}
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-1 text-[10px] text-danger">
            <AlertCircle size={10} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className={`text-[12px] text-${currentStyle.color} opacity-90 font-medium`}>
          {source === 'manual' ? 'Manual' : currentStyle.label}
          {fetchedAt && ` · ${formatDate(fetchedAt)}`}
        </div>

        {isOwner && (
          <div className="flex flex-col gap-1 w-full pt-2">
            <Button
              variant={rateStatus === 'fresh' ? 'ghost' : 'primary'}
              size="sm"
              onClick={handleUpdate}
              disabled={isUpdating || !tenantId || !isOnline}
              className="min-h-9 px-2 w-full active:scale-95 transition-transform"
            >
              {isUpdating ? <Spinner size="sm" /> : <RefreshCw size={14} />}
              {rateStatus === 'missing' ? 'Cargar tasa AHORA' : 'Actualizar'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowModal(true)}
              disabled={isUpdating || !tenantId}
              className="min-h-9 px-2 w-full active:scale-95 transition-transform"
            >
              <Settings size={14} />
              Manual
            </Button>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setManualRate('');
          setManualError('');
        }}
        title="Ajustar precio del dólar manualmente"
      >
        <div className="space-y-4 animate-slide-down">
          <p className="text-sm text-gray-600 leading-relaxed">
            Si la tasa automática del BCV no es la que usas en tu local, o no tienes internet, puedes
            escribir el valor del dólar aquí para que el sistema haga las cuentas exactas por ti.
          </p>

          <div className="input-wrapper">
            <label className="input-label font-semibold text-gray-700">Valor del dólar en Bolívares (Bs)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="65.50"
              value={manualRate}
              onChange={(e) => setManualRate(e.target.value)}
              error={manualError}
              validation={{ required: true, min: 0.01, max: 9999 }}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleManualSubmit}
              disabled={isUpdating || !isOnline}
            >
              {isUpdating ? 'Guardando...' : 'Guardar tasa'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
