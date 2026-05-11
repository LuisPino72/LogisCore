import { FC, useState } from 'react';
import { DollarSign, RefreshCw, AlertCircle, Settings } from 'lucide-react';
import { Button, Input, Modal, Spinner } from '../../../common/components';
import { useExchangeRate } from '../hooks/useExchangeRate';

interface ExchangeRateWidgetProps {
  tenantId: string | null;
  role: string | null;
}

export const ExchangeRateWidget: FC<ExchangeRateWidgetProps> = ({ tenantId, role }) => {
  const { rate, source, fetchedAt, loading, isUpdating, error, updateFromBcv, setManual } =
    useExchangeRate(tenantId);
  const [showModal, setShowModal] = useState(false);
  const [manualRate, setManualRate] = useState('');
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
    return `Bs. ${val.toFixed(2)}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign size={16} className="text-success" />
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Tasa BCV</span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-title font-bold text-success">
            {loading ? '-' : formatRate(rate)}
          </span>
          <span className="text-[10px] text-text-muted">/ $</span>
        </div>

        {error && (
          <div className="flex items-start gap-1.5 text-[11px] text-danger">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="text-[10px] text-text-muted">
          {source === 'bcv_api' && 'BCV'}
          {source === 'manual' && 'Manual'}
          {fetchedAt && ` · ${formatDate(fetchedAt)}`}
        </div>

        {isOwner && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleUpdate}
              disabled={isUpdating || !tenantId}
              className="btn btn-ghost btn-sm"
            >
              {isUpdating ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw size={14} />
              )}
              <span className="text-xs">Actualizar</span>
            </button>
            <button
              onClick={() => setShowModal(true)}
              disabled={isUpdating || !tenantId}
              className="btn btn-ghost btn-sm"
            >
              <Settings size={14} />
              <span className="text-xs">Manual</span>
            </button>
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setManualRate(''); setManualError(''); }} title="Configurar tasa manual">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Ingresa la tasa de cambio manualmente si la API del BCV no está disponible.
            </p>

            <div className="input-wrapper">
              <label className="input-label">Tasa (Bs. por $)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="68.45"
                value={manualRate}
                onChange={(e) => setManualRate(e.target.value)}
                error={manualError}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleManualSubmit}
                disabled={isUpdating}
              >
                {isUpdating ? 'Guardando...' : 'Guardar tasa'}
              </Button>
            </div>
          </div>
        </Modal>
    </>
  );
};
