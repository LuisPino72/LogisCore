import { useState, useMemo, useEffect } from 'react';
import { ListTree, Trash2, Edit3 } from 'lucide-react';
import { Button, SearchInput, Input, Modal, EmptyState } from '../../../common/components';
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

  useEffect(() => {
    if (isOpen && !showModal) {
      setModalMode('create');
      setFormName('');
      setFormError('');
      setShowModal(true);
    }
  }, [isOpen, showModal]);

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
    onClose?.();
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
      <SearchInput
        placeholder="Buscar categoría..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ListTree size={32} />}
          title={search ? 'Sin resultados' : 'Sin categorías'}
          description={search ? 'No se encontraron categorías con ese nombre' : 'Crea tu primera categoría'}
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-primary/5 transition-colors group border border-transparent hover:border-primary/10">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                <ListTree size={14} className="text-primary" />
              </div>
              <span className="text-sm font-medium text-gray-800 truncate flex-1">{cat.name}</span>
              <div className="w-1.5 h-1.5 rounded-full bg-primary/30 shrink-0" />
              {isOwner && (
                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(cat)} className="p-1.5 min-w-8 min-h-8" title="Editar">
                    <Edit3 size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(cat.id, cat.name)} className="p-1.5 min-w-8 min-h-8" title="Eliminar">
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
              validation={{ required: true, maxLength: 30 }}
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

  if (onClose !== undefined && isOpen) {
    return (
      <Modal isOpen={true} onClose={onClose} title="Gestionar categorías">
        {content}
      </Modal>
    );
  }

  return content;
}
