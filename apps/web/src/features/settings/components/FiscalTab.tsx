import { useState, useEffect, useCallback, type FC } from 'react';
import { Calculator } from 'lucide-react';
import { Card, Input, Toggle, Button, Alert } from '../../../common/components';
import { useAuthStore } from '../../auth/stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { settingsService } from '../services/settingsService';
import { useToastStore } from '../../../stores/toastStore';
import { SettingsErrors } from '../types/errors';

interface FiscalTabProps {
  tenantId?: string | null;
}

export const FiscalTab: FC<FiscalTabProps> = ({ tenantId }) => {
  const store = useSettingsStore();
  const { addToast } = useToastStore();
  const userId = useAuthStore((s) => s.session?.userId);

  const [ivaRate, setIvaRate] = useState('');
  const [igtfRate, setIgtfRate] = useState('');
  const [igtfEnabled, setIgtfEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setIvaRate((store.ivaRate * 100).toFixed(2));
    setIgtfRate((store.igtfRate * 100).toFixed(2));
    setIgtfEnabled(store.igtfEnabled);
  }, [store.ivaRate, store.igtfRate, store.igtfEnabled]);

  const handleSave = useCallback(async () => {
    setLocalError(null);

    const ivaNum = parseFloat(ivaRate);
    const igtfNum = parseFloat(igtfRate);

    if (isNaN(ivaNum) || ivaNum < 0 || ivaNum > 100) {
      setLocalError('IVA debe estar entre 0% y 100%');
      return;
    }
    if (isNaN(igtfNum) || igtfNum < 0 || igtfNum > 100) {
      setLocalError('IGTF debe estar entre 0% y 100%');
      return;
    }

    if (!tenantId || !userId) return;
    setSaving(true);

    const result = await settingsService.updateFiscalSettings(tenantId, userId, {
      ivaRate: ivaNum / 100,
      igtfRate: igtfNum / 100,
      igtfEnabled,
    });

    setSaving(false);

    if (result.ok) {
      useSettingsStore.getState().setFiscalSettings(result.data);
      addToast({ type: 'success', message: 'Tasas fiscales actualizadas correctamente' });
    } else {
      setLocalError(result.error.message);
    }
  }, [ivaRate, igtfRate, igtfEnabled, tenantId, userId, addToast]);

  const isFiscalBlocked = localError === SettingsErrors.SETTINGS_FISCAL_BLOCKED;

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Calculator size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Tasas Fiscales</h2>
            <p className="text-sm text-gray-500">
              Configura el IVA y el IGTF aplicados en las ventas del POS.
            </p>
          </div>
        </div>

        {isFiscalBlocked && (
          <Alert variant="error" onClose={() => setLocalError(null)}>
            {SettingsErrors.SETTINGS_FISCAL_BLOCKED}
          </Alert>
        )}

        {localError && !isFiscalBlocked && (
          <Alert variant="error" onClose={() => setLocalError(null)}>
            {localError}
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="IVA (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={ivaRate}
            onChange={(e) => setIvaRate(e.target.value)}
          />
          <Input
            label="IGTF (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={igtfRate}
            onChange={(e) => setIgtfRate(e.target.value)}
            disabled={!igtfEnabled}
          />
        </div>

        <Toggle
          label="Habilitar IGTF en ventas"
          checked={igtfEnabled}
          onChange={(e) => setIgtfEnabled(e.target.checked)}
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
