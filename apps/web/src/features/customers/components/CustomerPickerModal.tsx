import { useState, useEffect } from 'react';
import { Modal, SearchInput, Button, EmptyState, Spinner } from '../../../common/components';
import { User, UserPlus, X } from 'lucide-react';
import { useCustomerStore } from '../stores/customerStore';
import { useCustomers } from '../hooks/useCustomers';
import { useFuzzySearch } from '../../../lib/useFuzzySearch';
import type { CreateCustomerInput, Customer } from '../../../specs/customers';
import { CreateCustomerInputSchema } from '../../../specs/customers';
import { useToastStore } from '../../../stores/toastStore';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCedula, setNewCedula] = useState(''); // AUDIT-017: Cédula field V/E/J/P + 6-8 digits
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (isOpen && customers.length === 0) {
      fetchCustomers(tenantId);
    }
  }, [isOpen, customers.length, fetchCustomers, tenantId]);

  const fuzzyCustomers = useFuzzySearch(customers, searchQuery, { keys: ['name', 'phone', 'cedula'] }); // AUDIT-017: Cédula field V/E/J/P + 6-8 digits (búsqueda)

  const handleSelect = (customer: Customer | null) => {
    onSelect(customer);
    setSearchQuery('');
    setShowCreateForm(false);
    setNewName('');
    setNewPhone('');
    setNewCedula(''); // AUDIT-017
    setCreateError('');
    onClose();
  };

  const handleCreate = async () => {
    setCreateError('');
    const payload = {
      name: newName.trim(),
      phone: newPhone.trim() || undefined,
      cedula: newCedula.trim().toUpperCase() || undefined, // AUDIT-017
    };
    const parsed = CreateCustomerInputSchema.safeParse(payload);
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
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
          cedula: parsed.data.cedula, // AUDIT-017: Cédula field V/E/J/P + 6-8 digits
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
        setCreateError('No se pudo crear el cliente. Intenta de nuevo.');
      }
    } catch {
      setCreateError('Error de red. Verifica tu conexión.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); setShowCreateForm(false); setCreateError(''); }}
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
            <div className="max-h-64 overflow-y-auto space-y-1">
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                  !selectedCustomerId
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <X size={16} className="text-text-secondary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-gray-700">Sin cliente</p>
                  <p className="text-[10px] text-text-secondary">Venta anónima</p>
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
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                      selectedCustomerId === c.id
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <User size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      {/* AUDIT-017: Cédula field V/E/J/P + 6-8 digits */}
                      <div className="flex items-center gap-2 text-[10px] text-text-secondary">
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

          <Button
            variant="outline"
            fullWidth
            onClick={() => setShowCreateForm(true)}
            disabled={loading}
          >
            <UserPlus size={14} />
            Crear nuevo cliente
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowCreateForm(false)}
            className="text-xs text-primary hover:text-primary-dark"
          >
            ← Volver a la lista
          </button>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Nombre <span className="text-danger">*</span></label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 25))}
              placeholder="Ej: Juan Pérez"
              className="input"
              maxLength={25}
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">{newName.length}/25</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Cédula / RIF (opcional)</label>
            <input
              type="text"
              value={newCedula}
              onChange={(e) => setNewCedula(e.target.value.replace(/[^VEJGPvejpg0-9]/g, '').toUpperCase().slice(0, 9))} // AUDIT-017: Cédula field V/E/J/P + 6-8 digits
              placeholder="V12345678"
              className="input uppercase"
              maxLength={9}
            />
            <p className="text-xs text-gray-500 mt-1">Formato: V/E/J/G/P + 6-8 dígitos</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Teléfono (opcional)</label>
            <input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value.slice(0, 14))}
              placeholder="04121234567"
              className="input"
              maxLength={14}
            />
          </div>

          {createError && (
            <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger">
              {createError}
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
