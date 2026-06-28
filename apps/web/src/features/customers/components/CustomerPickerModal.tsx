import { useState, useEffect } from 'react';
import { Modal, SearchInput, Button, EmptyState, Spinner, CedulaInput, Input } from '../../../common/components';
import { User, UserPlus, X } from 'lucide-react';
import { useCustomerStore } from '../stores/customerStore';
import { useCustomers } from '../hooks/useCustomers';
import { useFuzzySearch } from '../../../lib/useFuzzySearch';
import { formatPhone, unformatPhone } from '../../../lib/utils';
import type { CreateCustomerInput, Customer } from '../../../specs/customers';
import { CreateCustomerInputSchema } from '../../../specs/customers';
import { useToastStore } from '../../../stores/toastStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';

interface CustomerPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (customer: Customer | null) => void;
  tenantId: string;
  selectedCustomerId?: string | null;
}

export function CustomerPickerModal({ isOpen, onClose, onSelect, tenantId, selectedCustomerId }: CustomerPickerModalProps) {
  const { customers, loading, fetchCustomers } = useCustomers(tenantId);
  const createCustomer = useCustomerStore((s) => s.createCustomer);
  const { addToast } = useToastStore();
  const session = useAuthStore((s) => s.session);
  const canCreate = hasActionPermission(session, 'customers', 'create');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCedula, setNewCedula] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && customers.length === 0) {
      fetchCustomers(tenantId);
    }
  }, [isOpen, customers.length, fetchCustomers, tenantId]);

  const fuzzyCustomers = useFuzzySearch(customers, searchQuery, { keys: ['name', 'phone', 'cedula'] });

  const handleSelect = (customer: Customer | null) => {
    onSelect(customer);
    setSearchQuery('');
    setShowCreateForm(false);
    setNewName('');
    setNewPhone('');
    setNewCedula('');
    setFieldErrors({});
    onClose();
  };

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  };

  const handleCreate = async () => {
    setFieldErrors({});
    const payload = {
      name: newName.trim(),
      phone: newPhone.trim() || undefined,
      cedula: newCedula.trim().toUpperCase() || undefined,
    };
    const parsed = CreateCustomerInputSchema.safeParse(payload);
    if (!parsed.success) {
      const zodErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
        zodErrors[field] = issue.message;
      });
      setFieldErrors(zodErrors);
      return;
    }
    setCreating(true);
    try {
      const newId = await createCustomer(tenantId, '', parsed.data as CreateCustomerInput);
      if (newId) {
        const newCustomer = customers.find((c) => c.id === newId) ?? {
          id: newId,
          name: parsed.data.name,
          phone: parsed.data.phone,
          cedula: parsed.data.cedula,
          address: undefined,
          creditLimit: 0,
          balance: 0,
          notes: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addToast({ type: 'success', message: 'Cliente creado.', duration: 2000 });
        handleSelect(newCustomer);
      } else {
        setFieldErrors({ form: 'No se pudo crear el cliente. Intenta de nuevo.' });
      }
    } catch {
      setFieldErrors({ form: 'Error de red. Verifica tu conexión.' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); setShowCreateForm(false); setFieldErrors({}); }}
      title="Asignar cliente"
      size="md"
    >
      {!showCreateForm ? (
        <div className="space-y-3">
          <SearchInput
            maxLength={25}
            placeholder="Buscar por nombre, cédula o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
          />

          {loading && customers.length === 0 ? (
            <div className="flex justify-center py-6"><Spinner size="sm" /></div>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1 customer-stagger">
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={`customer-item-hover w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                  !selectedCustomerId
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm shadow-primary/20'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <X size={16} className="text-text-secondary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-gray-700">Sin cliente</p>
                  <p className="text-xs text-text-secondary">Venta anónima</p>
                </div>
                {!selectedCustomerId && <span className="text-xs text-primary font-medium">✓</span>}
              </button>

              {fuzzyCustomers.length === 0 ? (
                <EmptyState
                  icon={<User size={28} />}
                  title="Sin resultados"
                  description={searchQuery ? 'Intenta con otro nombre' : 'No hay clientes aún'}
                />
              ) : (
                fuzzyCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className={`customer-item-hover active:scale-[0.98] w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                      selectedCustomerId === c.id
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-linear-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                      <User size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      {/* AUDIT-017: Cédula field V/E/J/P + 6-8 digits */}
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        {c.cedula && <span className="font-mono">{c.cedula}</span>}
                        {c.cedula && c.phone && <span>·</span>}
                        {c.phone && <span className="truncate">{c.phone}</span>}
                      </div>
                    </div>
                    {selectedCustomerId === c.id && <span className="text-xs text-primary font-medium">✓</span>}
                  </button>
                ))
              )}
            </div>
          )}

          {canCreate && (
            <Button
              variant="outline"
              fullWidth
              onClick={() => setShowCreateForm(true)}
              disabled={loading}
              className="shadow-sm hover:shadow-md transition-shadow"
            >
              <UserPlus size={14} />
              Crear nuevo cliente
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowCreateForm(false)}
            className="text-xs text-primary hover:text-primary-dark min-h-11 py-2 px-3 inline-flex items-center hover:translate-x-[-2px] transition-transform"
          >
            ← Volver a la lista
          </button>

          <Input
            label={<span>Nombre <span className="text-danger">*</span></span>}
            value={newName}
            onChange={(e) => { setNewName(e.target.value); clearFieldError('name'); }}
            error={fieldErrors.name}
            placeholder="Ej: Juan Pérez"
            validation={{ required: 'Ingresa el nombre del cliente', maxLength: 25 }}
            inputClassName="text-sm"
            autoComplete="name"
          />

          <CedulaInput
            label="Cédula / RIF (opcional)"
            value={newCedula}
            onChange={(val) => { setNewCedula(val); clearFieldError('cedula'); }}
            error={fieldErrors.cedula}
            hint="V/E/J/G/P + 6-8 dígitos"
          />

          <Input
            label="Teléfono (opcional)"
            value={formatPhone(newPhone)}
            onChange={(e) => { const formatted = formatPhone(e.target.value); setNewPhone(unformatPhone(formatted)); clearFieldError('phone'); }}
            error={fieldErrors.phone}
            placeholder="0412-1234567"
            validation={{ pattern: /^$|^0\d{10}$/, maxLength: 13 }}
            hint="Formato: 0412-1234567"
            inputClassName="text-sm"
            inputMode="tel"
          />

          {fieldErrors.form && (
            <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger animate-slide-down">
              {fieldErrors.form}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="ghost" fullWidth onClick={() => setShowCreateForm(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? 'Creando...' : 'Crear y asignar'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
