import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import { Building2, Upload, X, CreditCard, Bike } from 'lucide-react';
import { Card, Input, Button, Textarea, Alert, Skeleton, Checkbox, Modal } from '../../../common/components';
import { useAuthStore } from '../../auth/stores/authStore';
import { settingsService } from '../services/settingsService';
import { useSettingsStore } from '../stores/settingsStore';
import { useToastStore } from '../../../stores/toastStore';
import { sanitizeValue } from '../../../lib/validation';
import { formatPhone, unformatPhone } from '../../../lib/utils';
import { getDeliveryPersons, addDeliveryPerson, removeDeliveryPerson } from '../services/deliveryPersonService';
import type { DexieDeliveryPerson } from '../../../services/dexie/db';

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

  const [pagoMovilEnabled, setPagoMovilEnabled] = useState(false);
  const [pagoMovilBank, setPagoMovilBank] = useState('');
  const [pagoMovilHolder, setPagoMovilHolder] = useState('');
  const [pagoMovilId, setPagoMovilId] = useState('');
  const [pagoMovilPhone, setPagoMovilPhone] = useState('');
  const [deliveryPersons, setDeliveryPersons] = useState<DexieDeliveryPerson[]>([]);
  const [showAddMotorizado, setShowAddMotorizado] = useState(false);
  const [newMotorizadoName, setNewMotorizadoName] = useState('');
  const [newMotorizadoPhone, setNewMotorizadoPhone] = useState('');
  const [loadingDelivery, setLoadingDelivery] = useState(true);
  const [deleteMotorizadoTarget, setDeleteMotorizadoTarget] = useState<{ id: string; name: string } | null>(null);

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
    setPagoMovilEnabled(store.pagoMovilEnabled);
    setPagoMovilBank(store.pagoMovilBank);
    setPagoMovilHolder(store.pagoMovilHolder);
    setPagoMovilId(store.pagoMovilId);
    setPagoMovilPhone(store.pagoMovilPhone);
  }, [store.ticketFooterMessage, store.pagoMovilEnabled, store.pagoMovilBank, store.pagoMovilHolder, store.pagoMovilId, store.pagoMovilPhone]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoadingDelivery(true);
    getDeliveryPersons(tenantId).then((result) => {
      if (cancelled) return;
      if (result.ok) setDeliveryPersons(result.data);
      setLoadingDelivery(false);
    });
    return () => { cancelled = true; };
  }, [tenantId]);

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
      await settingsService.updateOperationSettings(tenantId, userId, {
        maxDiscountPct: store.maxDiscountPct,
        defaultMinStock: store.defaultMinStock,
        defaultCreditLimit: store.defaultCreditLimit,
        mandatoryCustomerId: store.mandatoryCustomerId,
        lowStockThreshold: store.lowStockThreshold,
        ticketFooterMessage,
        needsKitchenDefault: store.needsKitchenDefault,
        defaultDeliveryFee: store.defaultDeliveryFee,
        pagoMovilEnabled,
        pagoMovilBank,
        pagoMovilHolder,
        pagoMovilId,
        pagoMovilPhone,
      });
      addToast({ type: 'success', message: 'Datos del negocio actualizados correctamente' });
    } else {
      setLocalError(result.error.message);
    }
  }, [tenantId, userId, name, rif, address, phone, logoFile, logoUrl, ticketFooterMessage, store.ticketFooterMessage, store.maxDiscountPct, store.defaultMinStock, store.defaultCreditLimit, store.mandatoryCustomerId, store.lowStockThreshold, store.needsKitchenDefault, store.defaultDeliveryFee, pagoMovilEnabled, pagoMovilBank, pagoMovilHolder, pagoMovilId, pagoMovilPhone, addToast]);

  const handleAddMotorizado = useCallback(async () => {
    if (!tenantId || !userId) return;
    if (!newMotorizadoName.trim() || !newMotorizadoPhone.trim()) {
      setLocalError('Nombre y teléfono son obligatorios');
      return;
    }
    const result = await addDeliveryPerson({
      name: newMotorizadoName.trim(),
      phone: newMotorizadoPhone.trim(),
      tenantId,
      userId,
    });
    if (result.ok) {
      setDeliveryPersons((prev) => [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      setShowAddMotorizado(false);
      setNewMotorizadoName('');
      setNewMotorizadoPhone('');
      addToast({ type: 'success', message: 'Motorizado agregado' });
    } else {
      setLocalError(result.error.message);
    }
  }, [tenantId, userId, newMotorizadoName, newMotorizadoPhone, addToast]);

  const handleRemoveMotorizado = useCallback(async () => {
    if (!deleteMotorizadoTarget || !tenantId || !userId) return;
    const { id } = deleteMotorizadoTarget;
    const result = await removeDeliveryPerson(id, tenantId, userId);
    if (result.ok) {
      setDeliveryPersons((prev) => prev.filter((p) => p.id !== id));
      addToast({ type: 'success', message: 'Motorizado eliminado' });
    } else {
      setLocalError(result.error.message);
    }
    setDeleteMotorizadoTarget(null);
  }, [deleteMotorizadoTarget, tenantId, userId, addToast]);

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
    <>
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
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="min-h-11">
              <Upload size={16} />
              <span>Subir logo del negocio</span>
            </Button>
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

    <Card className="hover:shadow-md transition-shadow duration-200">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <CreditCard size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Pago Móvil</h2>
            <p className="text-sm text-gray-500">
              Datos para recibir pagos móviles.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Checkbox
            label="Habilitar pago móvil"
            checked={pagoMovilEnabled}
            onChange={(e) => setPagoMovilEnabled(e.target.checked)}
          />

          {pagoMovilEnabled && (
            <>
              <Input
                label="Banco"
                value={pagoMovilBank}
                onChange={(e) => setPagoMovilBank(e.target.value)}
                placeholder="Ej: Mercantil"
              />
              <Input
                label="Titular"
                value={pagoMovilHolder}
                onChange={(e) => setPagoMovilHolder(e.target.value)}
                placeholder="Nombre del titular"
              />
              <Input
                label="Cédula/RIF"
                value={pagoMovilId}
                onChange={(e) => setPagoMovilId(e.target.value)}
                placeholder="V-12345678"
              />
              <Input
                label="Teléfono"
                value={formatPhone(pagoMovilPhone)}
                onChange={(e) => { const formatted = formatPhone(e.target.value); setPagoMovilPhone(unformatPhone(formatted)); }}
                inputMode="tel"
                placeholder="0412-1234567"
              />
            </>
          )}
        </div>
      </div>
    </Card>

    <Card className="hover:shadow-md transition-shadow duration-200">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Bike size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Motorizados</h2>
            <p className="text-sm text-gray-500">
              Gestiona los motorizados del negocio.
            </p>
          </div>
        </div>

        {!loadingDelivery && deliveryPersons.length > 0 && (
          <div className="space-y-1">
            {deliveryPersons.map((person) => (
              <div key={person.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{person.name}</p>
                  <p className="text-sm text-gray-500">{formatPhone(person.phone)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteMotorizadoTarget({ id: person.id, name: person.name })}
                  className="text-gray-400 hover:text-danger min-w-[44px] min-h-[44px]"
                  aria-label={`Eliminar motorizado ${person.name}`}
                >
                  <X size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}

        {loadingDelivery && (
          <Skeleton variant="shimmer" className="h-10 rounded-lg" />
        )}

        <Button
          variant="outline"
          onClick={() => setShowAddMotorizado(true)}
          className="min-h-11"
        >
          + Agregar motorizado
        </Button>
      </div>
    </Card>

    {showAddMotorizado && (
      <Modal
        isOpen={showAddMotorizado}
        onClose={() => { setShowAddMotorizado(false); setNewMotorizadoName(''); setNewMotorizadoPhone(''); setLocalError(null); }}
        title="Agregar motorizado"
        footer={
          <div className="flex gap-2 w-full">
            <Button
              variant="primary"
              className="flex-1 min-h-11"
              onClick={handleAddMotorizado}
            >
              Agregar
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => { setShowAddMotorizado(false); setNewMotorizadoName(''); setNewMotorizadoPhone(''); setLocalError(null); }}
            >
              Cancelar
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="Nombre"
            value={newMotorizadoName}
            onChange={(e) => setNewMotorizadoName(e.target.value)}
          />
          <Input
            label="Teléfono"
            value={formatPhone(newMotorizadoPhone)}
            onChange={(e) => { const formatted = formatPhone(e.target.value); setNewMotorizadoPhone(unformatPhone(formatted)); }}
            inputMode="tel"
          />
        </div>
      </Modal>
    )}

    <Modal
      isOpen={!!deleteMotorizadoTarget}
      onClose={() => setDeleteMotorizadoTarget(null)}
      title="Eliminar motorizado"
      size="sm"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="ghost" className="flex-1" onClick={() => setDeleteMotorizadoTarget(null)}>
            Cancelar
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleRemoveMotorizado}>
            Eliminar
          </Button>
        </div>
      }
    >
      <p className="text-sm text-gray-600">
        ¿Eliminar motorizado "{deleteMotorizadoTarget?.name}"? Esta acción no se puede deshacer.
      </p>
    </Modal>
    </>
  );
};
