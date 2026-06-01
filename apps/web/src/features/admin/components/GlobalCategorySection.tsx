import { useState, useEffect, useMemo } from 'react';
import { Edit2, Trash2, Tags } from 'lucide-react';
import { Button, Card, DataTable, Pagination, SearchInput } from '../../../common/components';
import { useFuzzySearch } from '../../../lib/useFuzzySearch';
import type { Column } from '../../../common/components/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import type { GlobalCategory, CreateGlobalCategoryInput } from '../types';
import type { Result, AppError } from '@logiscore/core';
import { GlobalCategoryFormModal } from './GlobalCategoryFormModal';
import { DeleteGlobalCategoryModal } from './DeleteGlobalCategoryModal';

const PAGE_SIZE = 10;

interface GlobalCategorySectionProps {
  globalCategories: GlobalCategory[];
  createGlobalCategory: (input: CreateGlobalCategoryInput) => Promise<Result<GlobalCategory, AppError>>;
  updateGlobalCategory: (id: string, name: string) => Promise<Result<GlobalCategory, AppError>>;
  deleteGlobalCategory: (id: string) => Promise<Result<void, AppError>>;
  showCreateModal?: boolean;
  onCloseCreateModal?: () => void;
}

export function GlobalCategorySection({
  globalCategories,
  createGlobalCategory,
  updateGlobalCategory,
  deleteGlobalCategory,
  showCreateModal = false,
  onCloseCreateModal,
}: GlobalCategorySectionProps) {
  const { addToast } = useToastStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [formModal, setFormModal] = useState<{ isOpen: boolean; categoryId: string | null; initialName: string }>({
    isOpen: false, categoryId: null, initialName: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<GlobalCategory | null>(null);

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useFuzzySearch(globalCategories, search, { keys: ['name'] });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<GlobalCategory>[] = useMemo(() => [
    { key: 'name', header: 'Nombre' },
    {
      key: 'createdAt',
      header: 'Creado',
      render: (c: GlobalCategory) => new Date(c.createdAt).toLocaleDateString('es-ES'),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (c: GlobalCategory) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setFormModal({ isOpen: true, categoryId: c.id, initialName: c.name })}>
            <Edit2 size={16} />
            <span className="hidden sm:inline">Editar</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(c)}>
            <Trash2 size={16} className="text-gray-400 hover:text-danger" />
          </Button>
        </div>
      ),
    },
  ], []);

  return (
    <>
      <Card>
        <div className="p-4 pb-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Tags size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-title font-bold text-gray-900">Categorías Globales</h2>
              <p className="text-xs text-text-secondary">{globalCategories.length} categoría{globalCategories.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <SearchInput
            placeholder="Buscar categoría..."
            maxLength={15}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4"
          />
        </div>
        <div className="p-4 pt-0">
          <div className="hidden sm:block">
            <DataTable
              columns={columns}
              data={paginated}
              emptyMessage={search ? 'No se encontraron categorías con ese nombre.' : 'No hay categorías globales definidas. Crea la primera para que esté disponible en todos los nuevos locales.'}
              keyExtractor={(c: GlobalCategory) => c.id}
            />
          </div>
          <div className="sm:hidden space-y-2">
            {paginated.length === 0 ? (
              <p className="text-center text-sm text-text-secondary py-8">{search ? 'No se encontraron categorías con ese nombre.' : 'No hay categorías globales definidas.'}</p>
            ) : (
              paginated.map((c) => (
                <div key={c.id} className="flex flex-col gap-2 px-3 py-3 rounded-lg border border-gray-100 bg-white">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 wrap-break-word">{c.name}</p>
                    <p className="text-xs text-text-secondary">{new Date(c.createdAt).toLocaleDateString('es-ES')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" fullWidth onClick={() => setFormModal({ isOpen: true, categoryId: c.id, initialName: c.name })}>
                      <span className="hidden sm:inline">Editar</span>
                      <span className="sm:hidden">✎</span>
                    </Button>
                    <Button variant="ghost" size="sm" fullWidth onClick={() => setDeleteTarget(c)}>
                      <Trash2 size={16} className="text-gray-400" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </div>
      </Card>

      <GlobalCategoryFormModal
        isOpen={formModal.isOpen}
        onClose={() => setFormModal({ isOpen: false, categoryId: null, initialName: '' })}
        categoryId={formModal.categoryId}
        initialName={formModal.initialName}
        onSubmit={async (name) => {
          if (formModal.categoryId) {
            return updateGlobalCategory(formModal.categoryId, name);
          }
          return createGlobalCategory({ name });
        }}
      />

      <GlobalCategoryFormModal
        isOpen={showCreateModal}
        onClose={onCloseCreateModal ?? (() => {})}
        categoryId={null}
        initialName=""
        onSubmit={async (name) => createGlobalCategory({ name })}
      />

      <DeleteGlobalCategoryModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        categoryName={deleteTarget?.name ?? ''}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const result = await deleteGlobalCategory(deleteTarget.id);
          if (result.ok) {
            addToast({ type: 'success', message: 'Categoría eliminada.', duration: 4000 });
          } else {
            addToast({ type: 'error', message: result.error.message, duration: 5000 });
          }
        }}
      />
    </>
  );
}
