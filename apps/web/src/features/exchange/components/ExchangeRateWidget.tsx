import { FC, useState } from 'react';
import { DollarSign, RefreshCw, AlertCircle, Settings } from 'lucide-react';
import { Button, Input, Modal, Spinner } from '../../../common/components';
import { useExchangeRate } from '../hooks/useExchangeRate';
import { formatBs } from '@/lib/formatBs';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';

interface ExchangeRateWidgetProps {
  tenantId: string | null;
  role: string | null;
}

export const ExchangeRateWidget: FC<ExchangeRateWidgetProps> = ({ tenantId, role }) => {
  const { rate, source, fetchedAt, loading, isUpdating, error, updateFromBcv, setManual } =
    useExchangeRate(tenantId);
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
    if (!tenantId) return;
    await setManual(tenantId, parsed);
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

    return (
      <>
        <div className="flex flex-col items-center w-full">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center ring-1 ring-success/20">
              <DollarSign size={14} className="text-success" />
            </div>
            <span className="text-base font-title font-bold text-success">
              {loading ? '-' : formatRate(rate)}
            </span>
          </div>
 
          {error && (
            <div className="flex items-start gap-1 text-[10px] text-danger">
              <AlertCircle size={10} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
 
          <div className="text-[12px] text-text-secondary opacity-80">
            {source === 'bcv_api' ? 'BCV' : source === 'manual' ? 'Manual' : ''}
            {fetchedAt && ` ${formatDate(fetchedAt)}`}
          </div>
 
          {isOwner && (
            <div className="flex flex-col gap-1 w-full pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUpdate}
                disabled={isUpdating || !tenantId || !isOnline}
                className="min-h-9 px-2 w-full active:scale-95 transition-transform"
              >
                {isUpdating ? (
                  <Spinner size="sm" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Actualizar
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
 
        <Modal isOpen={showModal} onClose={() => { setShowModal(false); setManualRate(''); setManualError(''); }} title="Configurar tasa manual">
            <div className="space-y-4 animate-slide-down">
              <p className="text-sm text-gray-600">
                Ingresa la tasa de cambio manualmente si la API del BCV no está disponible.
              </p>
 
              <div className="input-wrapper">
                <label className="input-label">Tasa (Bs por $)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="68.45"
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
