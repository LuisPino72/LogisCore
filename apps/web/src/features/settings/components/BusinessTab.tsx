import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import { Building2, Upload, X } from 'lucide-react';
import { Card, Input, Button, Textarea, Alert, Skeleton } from '../../../common/components';
import { useAuthStore } from '../../auth/stores/authStore';
import { settingsService } from '../services/settingsService';
import { useSettingsStore } from '../stores/settingsStore';
import { useToastStore } from '../../../stores/toastStore';
import { sanitizeValue } from '../../../lib/validation';
import { formatPhone, unformatPhone } from '../../../lib/utils';

interface BusinessTabProps {
  tenantId?: string | null;
}

const LOGO_MAX_SIZE = 2 * 1024 * 1024;
const LOGO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const BusinessTab: FC<BusinessTabProps> = ({ tenantId }) => {
  const { addToast } = useToastStore();
  const userId = useAuthStore((s) => s.session?.userId);
  const store = useSettingsStore();

  const [name, setName] = useState('');
  const [rif, setRif] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [ticketFooterMessage, setTicketFooterMessage] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    settingsService.getBusinessInfo(tenantId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setName(result.data.name);
        setRif(result.data.rif);
        setAddress(result.data.address);
        setPhone(result.data.phone);
        setLogoUrl(result.data.logoUrl);
      } else {
        setLocalError(result.error.message);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => {
    setTicketFooterMessage(store.ticketFooterMessage);
  }, [store.ticketFooterMessage]);

  const handleLogoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
      setLogoError('Formato no válido. Usa JPG, PNG o WebP.');
      return;
    }
    if (file.size > LOGO_MAX_SIZE) {
      setLogoError('El logo debe ser menor a 2MB.');
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveLogo = useCallback(async () => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (logoUrl && tenantId) {
      const result = await settingsService.deleteBusinessLogo(tenantId, logoUrl);
      if (!result.ok) {
        // Best effort — logo will be overwritten on next upload
      }
    }
  }, [logoUrl, tenantId]);

  const handleSave = useCallback(async () => {
    setLocalError(null);
    if (!tenantId || !userId) return;

    const rifPattern = /^[VJEGP]\d{9}$/;
    if (!rifPattern.test(rif)) {
      setLocalError('RIF inválido. Debe ser formato: J123456789');
      return;
    }
    if (!name.trim()) {
      setLocalError('El nombre del negocio es obligatorio');
      return;
    }

    setSaving(true);

    let finalLogoUrl = logoUrl;

    if (logoFile) {
      setUploading(true);
      const uploadResult = await settingsService.uploadBusinessLogo(tenantId, logoFile);
      setUploading(false);
      if (uploadResult.ok) {
        finalLogoUrl = uploadResult.data;
      } else {
        setSaving(false);
        setLocalError(uploadResult.error.message);
        return;
      }
    }

    const result = await settingsService.updateBusinessInfo(tenantId, userId, {
      name: name.trim(),
      rif,
      address,
      phone,
      logoUrl: finalLogoUrl,
    });

    setSaving(false);

    if (result.ok) {
      setLogoUrl(finalLogoUrl);
      setLogoFile(null);
      setLogoPreview(null);
      if (ticketFooterMessage !== store.ticketFooterMessage) {
        await settingsService.updateOperationSettings(tenantId, userId, {
          maxDiscountPct: store.maxDiscountPct,
          defaultMinStock: store.defaultMinStock,
          defaultCreditLimit: store.defaultCreditLimit,
          mandatoryCustomerId: store.mandatoryCustomerId,
          lowStockThreshold: store.lowStockThreshold,
          ticketFooterMessage,
        });
      }
      addToast({ type: 'success', message: 'Datos del negocio actualizados correctamente' });
    } else {
      setLocalError(result.error.message);
    }
  }, [tenantId, userId, name, rif, address, phone, logoFile, logoUrl, ticketFooterMessage, store.ticketFooterMessage, store.maxDiscountPct, store.defaultMinStock, store.defaultCreditLimit, store.mandatoryCustomerId, store.lowStockThreshold, addToast]);

  if (loading) {
    return (
      <Card>
        <div className="p-4 sm:p-6 space-y-4">
          <Skeleton variant="title" className="w-48" />
          <Skeleton variant="shimmer" className="h-10 rounded-lg" />
          <Skeleton variant="shimmer" className="h-10 rounded-lg" />
          <Skeleton variant="shimmer" className="h-20 rounded-lg" />
          <Skeleton variant="shimmer" className="h-10 rounded-lg" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Building2 size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Mi Negocio</h2>
            <p className="text-sm text-gray-500">
              Información principal de tu local comercial.
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
            label="Nombre del negocio"
            value={name}
            onChange={(e) => setName(e.target.value)}
            validation={{ required: true, maxLength: 25 }}
            autoComplete="organization"
          />
          <Input
            label="RIF"
            value={rif}
            sanitize="rif"
            onChange={(e) => setRif(sanitizeValue(e.target.value, 'rif'))}
            validation={{ required: true, pattern: /^[VJEGP]\d{9}$/, maxLength: 10 }}
            autoComplete="off"
            hint="Ej: J123456789"
          />
          <Input
            label="Teléfono"
            value={formatPhone(phone)}
            onChange={(e) => { const formatted = formatPhone(e.target.value); setPhone(unformatPhone(formatted)); }}
            inputMode="tel"
            autoComplete="tel"
            hint="Ej: 0412-1234567"
          />
        </div>

        <Textarea
          label="Mensaje pie de ticket"
          value={ticketFooterMessage}
          onChange={(e) => setTicketFooterMessage(e.target.value)}
          validation={{ maxLength: 25 }}
          hint="Texto que aparece al final del ticket de venta (máx. 25 caracteres)."
          autoResize
          maxRows={3}
        />

        <Textarea
          label="Dirección"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          autoResize
          maxRows={3}
          hint="Dirección fiscal del negocio"
        />

        <div>
          <label htmlFor="logo-upload" className="block text-sm font-medium text-gray-700 mb-2">Logo del negocio</label>
          <input
            ref={fileInputRef}
            id="logo-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleLogoSelect}
          />
          {logoPreview ? (
            <div className="relative inline-block">
              <img src={logoPreview} alt="Preview logo" className="w-20 h-20 rounded-lg object-cover border border-gray-200 transition-all duration-200" />
              <Button
                variant="ghost"
                onClick={handleRemoveLogo}
                aria-label="Eliminar logo del negocio"
                className="absolute -top-2 -right-2 p-0! min-w-[44px] min-h-[44px] w-[44px] h-[44px] rounded-full bg-danger text-white hover:bg-danger-dark flex items-center justify-center transition-all duration-200"
              >
                <X size={16} />
              </Button>
            </div>
          ) : logoUrl ? (
            <div className="relative inline-block">
              <img src={logoUrl} alt="Logo actual" className="w-20 h-20 rounded-lg object-cover border border-gray-200 transition-all duration-200" />
              <Button
                variant="ghost"
                onClick={handleRemoveLogo}
                aria-label="Eliminar logo del negocio"
                className="absolute -top-2 -right-2 p-0! min-w-[44px] min-h-[44px] w-[44px] h-[44px] rounded-full bg-danger text-white hover:bg-danger-dark flex items-center justify-center transition-all duration-200"
              >
                <X size={16} />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 w-full sm:w-auto min-h-11 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all duration-200"
            >
              <Upload size={16} />
              <span>Subir logo del negocio</span>
            </button>
          )}
          {logoError && <p className="text-danger text-xs mt-1">{logoError}</p>}
        </div>

        <div className="pt-2">
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving || uploading}
            className="min-h-11 transition-all duration-200"
          >
            Guardar cambios
          </Button>
        </div>
      </div>
    </Card>
  );
};
