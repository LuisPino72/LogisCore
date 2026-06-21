import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, X, Power, Trash2 } from 'lucide-react';
import { Modal, Input, Button, Badge, DataTable } from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { adminService } from '../services/adminService';
import type { DexieRegisterConfig } from '../../../services/dexie/db';

interface RegisterManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export function RegisterManagerModal({ isOpen, onClose, tenantId }: RegisterManagerModalProps) {
  const { addToast } = useToastStore();
  const [registers, setRegisters] = useState<DexieRegisterConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadRegisters = useCallback(async () => {
    setLoading(true);
    const result = await adminService.getRegisters(tenantId);
    if (result.ok) {
      setRegisters(result.data);
    } else {
      addToast({ type: 'error', message: result.error.message, duration: 4000 });
    }
    setLoading(false);
  }, [tenantId, addToast]);

  useEffect(() => {
    if (isOpen) loadRegisters();
  }, [isOpen, loadRegisters]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (newName.trim().length > 50) {
      addToast({ type: 'error', message: 'El nombre no puede exceder 50 caracteres', duration: 4000 });
      return;
    }
    setSaving(true);
    const result = await adminService.createRegister({ tenantId, name: newName.trim() });
    if (result.ok) {
      setRegisters((prev) => [...prev, result.data]);
      setNewName('');
      setShowAddForm(false);
      addToast({ type: 'success', message: 'Caja creada correctamente', duration: 3000 });
    } else {
      addToast({ type: 'error', message: result.error.message, duration: 4000 });
    }
    setSaving(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim() || editName.trim().length > 50) {
      addToast({ type: 'error', message: 'El nombre no puede exceder 50 caracteres', duration: 4000 });
      return;
    }
    setSaving(true);
    const result = await adminService.updateRegister(id, { name: editName.trim() });
    if (result.ok) {
      setRegisters((prev) => prev.map((r) => (r.id === id ? result.data : r)));
      setEditingId(null);
      addToast({ type: 'success', message: 'Caja actualizada', duration: 3000 });
    } else {
      addToast({ type: 'error', message: result.error.message, duration: 4000 });
    }
    setSaving(false);
  };

  const handleToggleActive = async (register: DexieRegisterConfig) => {
    const result = await adminService.updateRegister(register.id, { isActive: !register.isActive });
    if (result.ok) {
      setRegisters((prev) => prev.map((r) => (r.id === register.id ? result.data : r)));
    } else {
      addToast({ type: 'error', message: result.error.message, duration: 4000 });
    }
  };

  const handleDelete = async (id: string) => {
    const result = await adminService.deleteRegister(id);
    if (result.ok) {
      setRegisters((prev) => prev.filter((r) => r.id !== id));
      addToast({ type: 'success', message: 'Caja eliminada', duration: 3000 });
    } else {
      addToast({ type: 'error', message: result.error.message, duration: 4000 });
    }
  };

  const columns: Column<DexieRegisterConfig>[] = [
    { key: 'name', header: 'Nombre' },
    {
      key: 'isActive',
      header: 'Estado',
      render: (r) => (
        r.isActive
          ? <Badge variant="success">Activo</Badge>
          : <Badge variant="neutral">Inactivo</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'overflow-visible',
      render: (r) => (
        <div className="flex gap-1 items-center">
          {editingId === r.id ? (
            <div className="flex gap-1 items-center">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                validation={{ maxLength: 50 }}
              />
              <Button variant="primary" size="sm" onClick={() => handleUpdate(r.id)} disabled={saving}>
                Guardar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                <X size={14} />
              </Button>
            </div>
          ) : (
            <>
              <Button variant="ghost-accent" size="sm" onClick={() => { setEditingId(r.id); setEditName(r.name); }}>
                <Edit2 size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleToggleActive(r)}>
                <Power size={14} />
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(r.id)}>
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestionar Cajas" size="lg">
      <div className="space-y-4">
        {showAddForm ? (
          <div className="flex gap-2 items-end flex-wrap">
            <Input
              placeholder="Nombre de la caja"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              validation={{ required: true, maxLength: 50 }}
            />
            <div className="flex gap-1">
              <Button variant="primary" onClick={handleCreate} disabled={saving || !newName.trim()}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button variant="ghost" onClick={() => { setShowAddForm(false); setNewName(''); }}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" onClick={() => setShowAddForm(true)}>
            <Plus size={16} /> Agregar Caja
          </Button>
        )}

        <DataTable
          columns={columns}
          data={registers}
          loading={loading}
          emptyMessage="No hay cajas configuradas"
          keyExtractor={(r) => r.id}
          renderCardOnMobile
        />
      </div>
    </Modal>
  );
}
