import { useState, useEffect } from 'react';
import { ListTree, Trash2, Edit3 } from 'lucide-react';
import { Button, SearchInput, Input, Modal, EmptyState, Pagination, Tooltip } from '../../../common/components';
import { useFuzzySearch } from '../../../lib/useFuzzySearch';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import type { Category, Product } from '../types';

const PAGE_SIZE = 10;

interface CategoryManagerProps {
  categories: Category[];
  products: Product[];
  isOwner: boolean;
  onCreate: (name: string) => Promise<boolean>;
  onUpdate: (id: string, name: string) => Promise<boolean>;
  onRequestDelete: (id: string, name: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function CategoryManager({ categories, products, isOwner, onCreate, onUpdate, onRequestDelete, isOpen, onClose }: CategoryManagerProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const session = useAuthStore((s) => s.session);
  const canUpdate = hasActionPermission(session, 'inventory', 'update');
  const canDelete = hasActionPermission(session, 'inventory', 'delete');

  const filtered = useFuzzySearch(categories, search, { keys: ['name'] });

  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

    // Validar nombre duplicado
    const trimmedName = formName.trim();
    const duplicate = categories.some(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== editingId
    );
    if (duplicate) {
      setFormError('Ya existe una categoría con ese nombre');
      return;
    }

    setSubmitting(true);
    setFormError('');

    let ok = false;
    if (modalMode === 'create') {
      ok = await onCreate(trimmedName);
    } else if (editingId) {
      ok = await onUpdate(editingId, trimmedName);
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
        maxLength={20}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
      />

      <div className="flex items-center gap-3 text-xs text-text-secondary px-1">
        <span>{categories.length} categoría{categories.length !== 1 ? 's' : ''}</span>
        <span className="text-gray-300">·</span>
        <span>{products.length} producto{products.length !== 1 ? 's' : ''}</span>
      </div>

      {paginated.length === 0 ? (
        <EmptyState
          icon={<ListTree size={32} />}
          title={search ? 'Sin resultados' : 'Todavía no hay categorías'}
          description={search ? 'No encontramos categorías con ese nombre. Intenta con otro término.' : 'Organiza tus productos creando tu primera categoría.'}
        />
      ) : (
        <>
          <div className="space-y-2 inventory-stagger">
            {paginated.map((cat) => (
            <div key={cat.id} className="flex flex-col items-center gap-1.5 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-2.5 rounded-lg bg-white sm:hover:bg-primary/5 transition-colors border border-gray-100 sm:border-transparent sm:hover:border-primary/10">
              <div className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ListTree size={16} className="text-primary" />
              </div>
              <span className="text-sm font-medium text-gray-900 wrap-break-word w-full text-center sm:text-left sm:flex-1 sm:min-w-0">{cat.name}</span>
              <span className="text-xs font-medium text-text-secondary bg-gray-100 px-1.5 py-0.5 rounded-full">
                {products.filter(p => p.categoryId === cat.id).length} productos
              </span>
              {isOwner && (
                <div className="flex gap-1">
                  {canUpdate && (
                    <Tooltip content="Editar" variant="help">
                      <Button variant="ghost-primary" size="sm" onClick={() => openEdit(cat)} className="p-1.5 min-w-11 min-h-11">
                        <Edit3 size={14} />
                      </Button>
                    </Tooltip>
                  )}
                  {canDelete && (
                    <Tooltip content="Eliminar" variant="danger">
                      <Button variant="ghost-danger" size="sm" onClick={() => handleDelete(cat.id, cat.name)} className="p-1.5 min-w-11 min-h-11">
                        <Trash2 size={14} />
                      </Button>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          ))}
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </>
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
              validation={{ required: true, maxLength: 25 }}
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
