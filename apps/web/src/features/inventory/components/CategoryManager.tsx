import { useState, useMemo } from 'react';
import { ListTree, Trash2, Plus, Edit3, Search } from 'lucide-react';
import { Button, Input, Modal, EmptyState } from '../../../common/components';
import type { Category } from '../types';

interface CategoryManagerProps {
  categories: Category[];
  isOwner: boolean;
  onCreate: (name: string) => Promise<boolean>;
  onUpdate: (id: string, name: string) => Promise<boolean>;
  onRequestDelete: (id: string, name: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function CategoryManager({ categories, isOwner, onCreate, onUpdate, onRequestDelete, isOpen, onClose }: CategoryManagerProps) {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const openCreate = () => {
    setModalMode('create');
    setFormName('');
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (cat: Category) => {
    setModalMode('edit');
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormError('');
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    setFormName('');
    setFormError('');
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) {
      setFormError('Ingresa un nombre');
      return;
    }
    setSubmitting(true);
    setFormError('');

    let ok = false;
    if (modalMode === 'create') {
      ok = await onCreate(formName.trim());
    } else if (editingId) {
      ok = await onUpdate(editingId, formName.trim());
    }

    setSubmitting(false);
    if (ok) handleClose();
  };

  const handleDelete = (id: string, name: string) => {
    onRequestDelete(id, name);
  };

  const content = (
    <div className="space-y-3">
      {isOwner && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Buscar categoría..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="primary" size="sm" onClick={openCreate} className="shrink-0 min-w-[44px]">
            <Plus size={16} />
          </Button>
        </div>
      )}

      {!isOwner && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Buscar categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ListTree size={32} />}
          title={search ? 'Sin resultados' : 'Sin categorías'}
          description={search ? 'No se encontraron categorías con ese nombre' : 'Crea tu primera categoría'}
        />
      ) : (
        <div className="space-y-1">
          {filtered.map((cat) => (
            <div key={cat.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-2 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="hidden sm:flex w-8 h-8 rounded-lg bg-primary/10 items-center justify-center shrink-0">
                  <ListTree size={14} className="text-primary" />
                </div>
                <span className="text-sm font-medium truncate">{cat.name}</span>
              </div>
              {isOwner && (
                <div className="flex gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(cat)} className="p-1.5 min-w-[32px] min-h-[32px]">
                    <Edit3 size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(cat.id, cat.name)} className="p-1.5 min-w-[32px] min-h-[32px]">
                    <Trash2 size={14} className="text-danger" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={handleClose} title={modalMode === 'create' ? 'Nueva categoría' : 'Editar categoría'} size="sm">
        <div className="space-y-4">
          <div className="input-wrapper">
            <label className="input-label">Nombre</label>
            <Input
              placeholder="Ej: Bebidas"
              value={formName}
              onChange={(e) => { setFormName(e.target.value); setFormError(''); }}
              error={formError}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Guardando...' : modalMode === 'create' ? 'Crear' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );

  if (onClose !== undefined) {
    return (
      <Modal isOpen={isOpen ?? false} onClose={onClose} title="Gestionar categorías">
        {content}
      </Modal>
    );
  }

  return content;
}
