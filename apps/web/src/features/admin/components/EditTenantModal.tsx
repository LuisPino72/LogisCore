import { useState, useEffect, useRef, useCallback } from 'react';
import { type Result, type AppError } from '@logiscore/core';
import { UserPlus, Upload, X, Monitor } from 'lucide-react';
import { Modal, Input, Button, Badge } from '../../../common/components';
import { sanitizeValue } from '../../../lib/validation';
import { formatPhone, unformatPhone } from '../../../lib/utils';
import { UpdateTenantSchema, type Tenant } from '../types';
import { adminService } from '../services/adminService';
import { RegisterManagerModal } from './RegisterManagerModal';

interface EditForm {
  name: string;
  rif: string;
  direccion: string;
  telefono: string;
}

interface EditTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  onSave: (id: string, data: EditForm) => Promise<Result<Tenant, AppError>>;
  onAddEmployeeClick: () => void;
}

const LOGO_MAX_SIZE = 2 * 1024 * 1024;
const LOGO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function EditTenantModal({ isOpen, onClose, tenant, onSave, onAddEmployeeClick }: EditTenantModalProps) {
  const [editForm, setEditForm] = useState<EditForm>({ name: '', rif: '', direccion: '', telefono: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [showRegisterManager, setShowRegisterManager] = useState(false);
  const [registerCount, setRegisterCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tenant) {
      setEditForm({
        name: tenant.name,
        rif: tenant.rif,
        direccion: tenant.direccion ?? '',
        telefono: tenant.telefono ?? '',
      });
      setLogoFile(null);
      setLogoPreview(null);
      setLogoError(null);
      setRemoveLogo(false);
      setError(null);
      adminService.getRegisters(tenant.id).then((result) => {
        if (result.ok) setRegisterCount(result.data.length);
      });
    }
  }, [tenant?.id, tenant?.name, tenant?.rif, tenant?.direccion, tenant?.telefono]);

  const handleLogoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setRemoveLogo(false);
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

  const handleRemoveLogo = useCallback(() => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
    setRemoveLogo(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleSave = async () => {
    if (!tenant) return;
    const parsed = UpdateTenantSchema.safeParse(editForm);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await onSave(tenant.id, editForm);
    if (result.ok) {
      if (logoFile) {
        const logoResult = await adminService.uploadLogo(tenant.id, logoFile);
        if (!logoResult.ok) {
          console.debug('[EditTenantModal] Logo upload failed:', logoResult.error.message);
        }
      } else if (removeLogo) {
        const currentLogoUrl = tenant?.logoUrl;
        if (currentLogoUrl) {
          await adminService.deleteLogo(currentLogoUrl);
          const { supabase } = await import('../../../services/supabase/client');
          await supabase.from('tenants').update({ logo_url: null }).eq('id', tenant.id);
        }
      }
      setIsSubmitting(false);
      onClose();
    } else {
      setIsSubmitting(false);
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
  };

  const currentLogoUrl = tenant?.logoUrl;
  const showCurrentLogo = currentLogoUrl && !logoPreview && !removeLogo;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Editar local"
    >
      <RegisterManagerModal
        isOpen={showRegisterManager}
        onClose={() => setShowRegisterManager(false)}
        tenantId={tenant?.id ?? ''}
      />
      <div className="space-y-4 admin-section-reveal">
        <Input
          placeholder="Nombre"
          value={editForm.name}
          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
          validation={{ required: true, maxLength: 25 }}
          autoComplete="organization"
        />
        <Input
          placeholder="RIF (J123456789)"
          value={editForm.rif}
          sanitize="rif"
          onChange={(e) => setEditForm((p) => ({ ...p, rif: sanitizeValue(e.target.value, 'rif') }))}
          validation={{ required: true, pattern: /^[VJEGP]\d{9}$/, maxLength: 12 }}
          autoComplete="off"
        />
        <Input
          placeholder="Teléfono (0412-1234567)"
          value={formatPhone(editForm.telefono)}
          onChange={(e) => { const formatted = formatPhone(e.target.value); setEditForm((p) => ({ ...p, telefono: unformatPhone(formatted) })); }}
          validation={{ pattern: /^(\+58|0)\d{10}$/, maxLength: 13 }}
          inputMode="tel"
          autoComplete="tel"
        />
        <Input
          placeholder="Dirección"
          value={editForm.direccion}
          onChange={(e) => setEditForm((p) => ({ ...p, direccion: e.target.value }))}
          validation={{ maxLength: 25 }}
          autoComplete="street-address"
        />

        {/* Logo upload */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleLogoSelect}
          />
          {showCurrentLogo ? (
            <div className="relative inline-block">
              <img src={currentLogoUrl} alt="Logo actual" className="w-20 h-20 rounded-lg object-cover border border-gray-200" />
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </div>
          ) : logoPreview ? (
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
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
            >
              <Upload size={16} />
              <span>Subir logo del negocio</span>
            </button>
          )}
          {logoError && <p className="text-danger text-xs mt-1">{logoError}</p>}
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          <Button variant="secondary" fullWidth onClick={onAddEmployeeClick}>
            <UserPlus size={16} /> Agregar empleado
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setShowRegisterManager(true)}>
            <Monitor size={16} /> Gestionar Cajas {registerCount > 0 && <Badge variant="info">{registerCount}</Badge>}
          </Button>
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-2">
          <Button variant="primary" fullWidth onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
