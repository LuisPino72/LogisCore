import { useState, useCallback, useRef } from 'react';
import { type Result, type AppError } from '@logiscore/core';
import { Building2, Shield, UserPlus, Plus, Trash2, Upload, X } from 'lucide-react';
import { Modal, Input, Button } from '../../../common/components';
import { sanitizeValue } from '../../../lib/validation';
import { formatPhone, unformatPhone } from '../../../lib/utils';
import { CreateTenantWithUsersInputSchema } from '../types';
import type { CreateTenantWithUsersInput, CreateTenantResponse } from '../types';
import { adminService } from '../services/adminService';

interface EmployeeForm {
  email: string;
  password: string;
  name: string;
}

interface CreateForm {
  tenant: { name: string; rif: string; direccion: string; telefono: string };
  owner: { email: string; password: string; name: string };
  employees: EmployeeForm[];
}

const emptyCreateForm: CreateForm = {
  tenant: { name: '', rif: '', direccion: '', telefono: '' },
  owner: { email: '', password: '', name: '' },
  employees: [],
};

const LOGO_MAX_SIZE = 2 * 1024 * 1024;
const LOGO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface CreateTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTenant: (payload: CreateTenantWithUsersInput) => Promise<Result<CreateTenantResponse, AppError>>;
}

export function CreateTenantModal({ isOpen, onClose, onCreateTenant }: CreateTenantModalProps) {
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setCreateForm(emptyCreateForm);
    setCreateError(null);
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
    onClose();
  }, [onClose]);

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

  const handleRemoveLogo = useCallback(() => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleCreate = async () => {
    setCreateError(null);
    setLogoError(null);
    const filteredEmployees = createForm.employees.filter(
      (emp) => emp.name.trim() || emp.email.trim() || emp.password.trim(),
    );
    const payload = { ...createForm, employees: filteredEmployees };
    const parsed = CreateTenantWithUsersInputSchema.safeParse(payload);
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setIsSubmitting(true);
    const result = await onCreateTenant(parsed.data);
    setIsSubmitting(false);
    if (result.ok) {
      if (logoFile) {
        const logoResult = await adminService.uploadLogo(result.data.tenant.id, logoFile);
        if (!logoResult.ok) {
          console.debug('[CreateTenantModal] Logo upload failed:', logoResult.error.message);
        }
      }
      handleClose();
    } else {
      setCreateError(result.error.message);
    }
  };

  const addEmployeeRow = () => {
    if (createForm.employees.length >= 3) return;
    setCreateForm((prev) => ({
      ...prev,
      employees: [...prev.employees, { email: '', password: '', name: '' }],
    }));
  };

  const removeEmployeeRow = (index: number) => {
    setCreateForm((prev) => ({
      ...prev,
      employees: prev.employees.filter((_, i) => i !== index),
    }));
  };

  const updateEmployeeRow = (index: number, field: keyof EmployeeForm, value: string) => {
    setCreateForm((prev) => {
      const updated = [...prev.employees];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, employees: updated };
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Crear nuevo local"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Tenant section */}
        <div className="space-y-2 admin-section-reveal">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 size={16} className="text-primary" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Datos del Negocio</p>
          </div>
          <Input
            placeholder="Nombre"
            value={createForm.tenant.name}
            onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, name: e.target.value } }))}
            validation={{ required: true, maxLength: 25 }}
            autoComplete="organization"
          />
          <Input
            placeholder="RIF (J123456789)"
            value={createForm.tenant.rif}
            sanitize="rif"
            onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, rif: sanitizeValue(e.target.value, 'rif') } }))}
            validation={{ required: true, pattern: /^[VJEGP]\d{9}$/, maxLength: 12 }}
            autoComplete="off"
          />
          <Input
            placeholder="Teléfono (0412-1234567)"
            value={formatPhone(createForm.tenant.telefono)}
            onChange={(e) => { const formatted = formatPhone(e.target.value); setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, telefono: unformatPhone(formatted) } })); }}
            validation={{ pattern: /^(\+58|0)\d{10}$/, maxLength: 13 }}
            inputMode="tel"
            autoComplete="tel"
          />
          <Input
            placeholder="Dirección"
            value={createForm.tenant.direccion}
            onChange={(e) => setCreateForm((p) => ({ ...p, tenant: { ...p.tenant, direccion: e.target.value } }))}
            validation={{ maxLength: 25 }}
            autoComplete="street-address"
          />

          {/* Logo upload */}
          <div className="pt-1">
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
        </div>

        {/* Owner section */}
        <div className="space-y-2 admin-section-reveal">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Shield size={16} className="text-accent" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Propietario (obligatorio)</p>
          </div>
          <Input
            placeholder="Nombre del propietario"
            value={createForm.owner.name}
            onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, name: e.target.value } }))}
            validation={{ required: true, maxLength: 25 }}
            autoComplete="name"
          />
          <Input
            placeholder="Email del propietario"
            type="email"
            value={createForm.owner.email}
            onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, email: e.target.value } }))}
            validation={{ required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, maxLength: 30 }}
            autoComplete="email"
          />
          <Input
            placeholder="Contraseña"
            type="password"
            showPassword
            value={createForm.owner.password}
            onChange={(e) => setCreateForm((p) => ({ ...p, owner: { ...p.owner, password: e.target.value } }))}
            validation={{ required: true, minLength: 8, maxLength: 20 }}
            autoComplete="new-password"
          />
        </div>

        {/* Employees section */}
        <div className="space-y-2 admin-section-reveal">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <UserPlus size={16} className="text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-gray-700">Empleados (opcional, max 3)</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={addEmployeeRow}
              disabled={createForm.employees.length >= 3}
            >
              <Plus size={16} /> Agregar
            </Button>
          </div>
          {createForm.employees.map((emp, i) => (
            <div key={i} className="rounded-lg bg-surface-alt border border-border p-3 space-y-2 admin-field">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Empleado #{i + 1}</span>
                <Button variant="danger" size="sm" className="min-h-11" onClick={() => removeEmployeeRow(i)}>
                  <Trash2 size={14} />
                </Button>
              </div>
              <Input
                placeholder="Nombre"
                value={emp.name}
                onChange={(e) => updateEmployeeRow(i, 'name', e.target.value)}
                validation={{ maxLength: 25 }}
                autoComplete="name"
              />
              <Input
                placeholder="Email"
                type="email"
                value={emp.email}
                onChange={(e) => updateEmployeeRow(i, 'email', e.target.value)}
                validation={{ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, maxLength: 30 }}
                autoComplete="email"
              />
              <Input
                placeholder="Contraseña"
                type="password"
                showPassword
                value={emp.password}
                onChange={(e) => updateEmployeeRow(i, 'password', e.target.value)}
                validation={{ minLength: 8, maxLength: 20 }}
                autoComplete="new-password"
              />
            </div>
          ))}
        </div>

        {createError && <p className="text-danger text-sm">{createError}</p>}

        <div className="flex gap-2 pt-2">
          <Button
            variant="primary"
            fullWidth
            onClick={handleCreate}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creando...' : 'Crear Negocio'}
          </Button>
          <Button variant="secondary" fullWidth onClick={handleClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
