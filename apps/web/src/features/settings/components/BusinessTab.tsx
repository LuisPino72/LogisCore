import { useState, useEffect, useRef, type FC } from 'react';
import { Card, Input, Button, Textarea, Alert } from '../../../common/components';
import { Upload, X } from 'lucide-react';
import { useAuthStore } from '../../auth/stores/authStore';
import { settingsService } from '../services/settingsService';
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

  const [name, setName] = useState('');
  const [rif, setRif] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
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

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
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
      addToast({ type: 'success', message: 'Datos del negocio actualizados correctamente' });
    } else {
      setLocalError(result.error.message);
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="p-4 sm:p-6 space-y-4 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-48" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-20 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4 sm:p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Mi Negocio</h2>
          <p className="text-sm text-gray-500">
            Información principal de tu local comercial.
          </p>
        </div>

        {localError && (
          <Alert variant="error" onClose={() => setLocalError(null)}>
            {localError}
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Nombre del negocio"
            value={name}
            onChange={(e) => setName(e.target.value)}
            validation={{ required: true, maxLength: 100 }}
            autoComplete="organization"
          />
          <Input
            label="RIF"
            value={rif}
            sanitize="rif"
            onChange={(e) => setRif(sanitizeValue(e.target.value, 'rif'))}
            validation={{ required: true, pattern: /^[VJEGP]\d{9}$/, maxLength: 12 }}
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
          label="Dirección"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          autoResize
          maxRows={3}
          hint="Dirección fiscal del negocio"
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Logo del negocio</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleLogoSelect}
          />
          {logoPreview ? (
            <div className="relative inline-block">
              <img src={logoPreview} alt="Preview logo" className="w-20 h-20 rounded-lg object-cover border border-gray-200" />
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </div>
          ) : logoUrl ? (
            <div className="relative inline-block">
              <img src={logoUrl} alt="Logo actual" className="w-20 h-20 rounded-lg object-cover border border-gray-200" />
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition-colors"
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
            className="min-h-11"
          >
            Guardar cambios
          </Button>
        </div>
      </div>
    </Card>
  );
};