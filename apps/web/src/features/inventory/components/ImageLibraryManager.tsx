import { useState, useEffect, useMemo } from 'react';
import { Upload, Trash2, Edit3, Star, Image as ImageIcon } from 'lucide-react';
import { Button, SearchInput, Input, Modal, EmptyState, SearchableSelect, Spinner } from '../../../common/components';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { getLibraryImages, uploadLibraryImage, updateLibraryImage, deleteLibraryImage, adminGetLibraryImages, adminUploadImage, adminUpdateImage, adminDeleteImage } from '../services/imageLibraryService';
import { getCategories, adminGetGlobalCategories } from '../services/categoryService';
import type { ImageLibrary } from '../../../specs/image-library';
import type { Category } from '../types';

interface ImageLibraryManagerProps {
  tenantId?: string;
  adminMode?: boolean;
}

export function ImageLibraryManager({ tenantId: tenantIdProp, adminMode = false }: ImageLibraryManagerProps = {}) {
  const session = useAuthStore((s) => s.session);
  const tenantId = tenantIdProp || session?.tenantId || '';
  const isOwner = session?.role === 'admin' || session?.role === 'owner';
  const canManage = isOwner && hasActionPermission(session!, 'inventory', 'manage_library');

  const [images, setImages] = useState<ImageLibrary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageLibrary | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadCategoryId, setUploadCategoryId] = useState<string | null>(null);
  const [uploadIsDefault, setUploadIsDefault] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editError, setEditError] = useState('');
  const [editing, setEditing] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [tenantId, adminMode]);

  const loadData = async () => {
    if (!adminMode && !tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [imagesResult, categoriesResult] = await Promise.all([
      adminMode ? adminGetLibraryImages() : getLibraryImages(tenantId),
      adminMode ? adminGetGlobalCategories() : getCategories(tenantId),
    ]);
    if (imagesResult.ok) {
      setImages(imagesResult.data);
    }
    if (categoriesResult.ok) {
      setCategories(categoriesResult.data);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = images;
    if (filterCategory !== 'all') {
      result = result.filter((img) => img.categoryId === filterCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((img) => img.name.toLowerCase().includes(q));
    }
    return result;
  }, [images, search, filterCategory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Formato no soportado. Usa JPG, PNG o WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('La imagen no puede superar 2MB.');
      return;
    }

    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setUploadError('');
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) {
      setUploadError('Nombre requerido.');
      return;
    }

    setUploading(true);
    setUploadError('');

    const result = adminMode
      ? await adminUploadImage(uploadFile, uploadName.trim(), uploadCategoryId, uploadIsDefault)
      : await uploadLibraryImage(uploadFile, uploadName.trim(), uploadCategoryId, uploadIsDefault, tenantId);

    setUploading(false);
    if (result.ok) {
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadPreview(null);
      setUploadName('');
      setUploadCategoryId(null);
      setUploadIsDefault(false);
      await loadData();
    } else {
      setUploadError(result.error.message);
    }
  };

  const openEdit = (img: ImageLibrary) => {
    setSelectedImage(img);
    setEditName(img.name);
    setEditCategoryId(img.categoryId ?? null);
    setEditIsDefault(img.isDefault);
    setEditError('');
    setShowEditModal(true);
  };

  const handleEdit = async () => {
    if (!selectedImage || !editName.trim()) {
      setEditError('Nombre requerido.');
      return;
    }

    setEditing(true);
    setEditError('');

    const result = adminMode
      ? await adminUpdateImage(selectedImage.id, { name: editName.trim(), categoryId: editCategoryId, isDefault: editIsDefault })
      : await updateLibraryImage(selectedImage.id, { name: editName.trim(), categoryId: editCategoryId, isDefault: editIsDefault }, tenantId);

    setEditing(false);
    if (result.ok) {
      setShowEditModal(false);
      setSelectedImage(null);
      await loadData();
    } else {
      setEditError(result.error.message);
    }
  };

  const handleDelete = async (id: string) => {
    const result = adminMode
      ? await adminDeleteImage(id)
      : await deleteLibraryImage(id, tenantId);
    if (result.ok) {
      setDeleteConfirmId(null);
      await loadData();
    }
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadPreview(null);
    setUploadName('');
    setUploadCategoryId(null);
    setUploadIsDefault(false);
    setUploadError('');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-title font-semibold text-gray-900">Biblioteca de Imágenes</h2>
        {canManage && (
          <Button
            variant="primary"
            size="sm"
            className="min-h-11"
            onClick={() => {
              resetUploadForm();
              setShowUploadModal(true);
            }}
          >
            <Upload size={16} />
            <span className="hidden sm:inline">Subir imagen</span>
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            placeholder="Buscar imagen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
          />
        </div>
        <SearchableSelect
          value={filterCategory}
          onChange={(val) => setFilterCategory(val)}
          placeholder="Todas las categorías"
          searchPlaceholder="Buscar categoría..."
          className="w-full sm:w-48"
          options={[
            { value: 'all', label: 'Todas las categorías' },
            ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
          ]}
        />
      </div>

      <div className="text-xs text-text-secondary px-1">
        {filtered.length} imagen{filtered.length !== 1 ? 'es' : ''}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ImageIcon size={32} />}
          title={search || filterCategory !== 'all' ? 'Sin resultados' : 'Todavía no hay imágenes'}
          description={
            search || filterCategory !== 'all'
              ? 'No encontramos imágenes con esos filtros. Intenta con otros términos.'
              : 'Sube tu primera imagen para empezar a organizar tu biblioteca.'
          }
        />
      ) : (
        <div
          className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3"
          style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }}
        >
          {filtered.map((img) => (
            <div
              key={img.id}
              className="relative aspect-square rounded-lg overflow-hidden border border-gray-100 bg-white group"
              style={{ contentVisibility: 'auto' }}
            >
              <img
                src={img.imageUrl}
                alt={img.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              {img.isDefault && (
                <span className="absolute top-1 right-1 bg-yellow-500 text-white text-[10px] px-1 rounded flex items-center gap-0.5">
                  <Star size={10} fill="currentColor" />
                  Default
                </span>
              )}
              <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[11px] py-0.5 px-1 truncate">
                {img.name}
              </span>
              {canManage && (
                <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost-primary"
                    size="sm"
                    className="p-1 min-w-8 min-h-8 bg-white/90"
                    onClick={() => openEdit(img)}
                  >
                    <Edit3 size={12} />
                  </Button>
                  <Button
                    variant="ghost-danger"
                    size="sm"
                    className="p-1 min-w-8 min-h-8 bg-white/90"
                    onClick={() => setDeleteConfirmId(img.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Subir imagen"
        size="sm"
      >
        <div className="space-y-4">
          <div className="input-wrapper">
            <label className="input-label">Imagen</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
            {uploadPreview && (
              <div className="mt-2">
                <img src={uploadPreview} alt="Preview" className="w-24 h-24 object-cover rounded-lg" />
              </div>
            )}
          </div>

          <div className="input-wrapper">
            <label className="input-label">Nombre</label>
            <Input
              placeholder="Ej: Coca-Cola 500ml"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="input-wrapper">
            <label className="input-label">Categoría</label>
            <SearchableSelect
              value={uploadCategoryId ?? ''}
              onChange={(val) => setUploadCategoryId(val || null)}
              placeholder="Sin categoría"
              searchPlaceholder="Buscar categoría..."
              options={[
                { value: '', label: 'Sin categoría' },
                ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="upload-default"
              checked={uploadIsDefault}
              onChange={(e) => setUploadIsDefault(e.target.checked)}
              className="h-4 w-4 text-primary rounded border-gray-300"
            />
            <label htmlFor="upload-default" className="text-sm text-gray-700">
              Establecer como imagen default de la categoría
            </label>
          </div>

          {uploadError && (
            <p className="text-sm text-red-500">{uploadError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowUploadModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleUpload}
              disabled={uploading || !uploadFile || !uploadName.trim()}
            >
              {uploading ? 'Subiendo...' : 'Subir'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar imagen"
        size="sm"
      >
        <div className="space-y-4">
          {selectedImage && (
            <div className="flex justify-center">
              <img src={selectedImage.imageUrl} alt={selectedImage.name} className="w-24 h-24 object-cover rounded-lg" />
            </div>
          )}

          <div className="input-wrapper">
            <label className="input-label">Nombre</label>
            <Input
              placeholder="Nombre de la imagen"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="input-wrapper">
            <label className="input-label">Categoría</label>
            <SearchableSelect
              value={editCategoryId ?? ''}
              onChange={(val) => setEditCategoryId(val || null)}
              placeholder="Sin categoría"
              searchPlaceholder="Buscar categoría..."
              options={[
                { value: '', label: 'Sin categoría' },
                ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit-default"
              checked={editIsDefault}
              onChange={(e) => setEditIsDefault(e.target.checked)}
              className="h-4 w-4 text-primary rounded border-gray-300"
            />
            <label htmlFor="edit-default" className="text-sm text-gray-700">
              Establecer como imagen default de la categoría
            </label>
          </div>

          {editError && (
            <p className="text-sm text-red-500">{editError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleEdit}
              disabled={editing || !editName.trim()}
            >
              {editing ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Confirmar eliminación"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            ¿Estás seguro de que deseas eliminar esta imagen? Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
