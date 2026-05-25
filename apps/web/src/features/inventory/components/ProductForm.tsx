import { useState, useRef } from 'react';
import { Button, Input, Modal, Checkbox, Select, SearchableSelect } from '../../../common/components';
import { ImagePlus, Plus, X, Scan, Package, DollarSign, Layers, Settings, Trash2 } from 'lucide-react';
import { useProductForm } from '../hooks/useProductForm';
import { BarcodeScannerModal } from '../../shared/components/BarcodeScannerModal';
import type { Category, CreateProductInput, CreatePresentationInput, Product } from '../types';

interface ProductFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' | 'independent' }, imageFile?: File | null) => Promise<boolean>;
  categories: Category[];
  editProduct?: Product | null;
  onCreateCategory?: (name: string) => Promise<string | null>;
}

const SectionDivider = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <div className="flex items-center gap-2 pt-2">
    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
      {icon}
    </div>
    <h3 className="text-xs font-title font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
    <div className="flex-1 h-px bg-gray-100" />
  </div>
);

export function ProductForm({ isOpen, onClose, onSubmit, categories, editProduct, onCreateCategory }: ProductFormProps) {
  const isEditing = !!editProduct;
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(editProduct?.imageUrl ?? null);
  const blobUrlRef = useRef<string | null>(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const initialValues = editProduct ? {
    name: editProduct.name,
    sku: editProduct.sku,
    priceUsd: editProduct.priceUsd,
    categoryId: editProduct.categoryId,
    isWeighted: editProduct.isWeighted,
    unit: editProduct.unit,
    stockMin: editProduct.stockMin,
    costPrice: 0,
  } : undefined;

  const wrappedOnSubmit = async (data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' | 'independent' }): Promise<boolean> => {
    const result = await onSubmit(data, imageFile);
    if (result && !imageFile) {
      setImageFile(null);
      setImagePreview(null);
    }
    return result;
  };

  const {
    formData,
    errors,
    isSubmitting,
    setField,
    handleSubmit: formSubmit,
    reset,
    presentations,
    addPresentation,
    removePresentation,
    updatePresentation,
    setStockType,
    stockType,
  } = useProductForm({ onSubmit: wrappedOnSubmit, initialValues, editProductId: editProduct?.id });

  const revokeBlobUrl = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  };

  const handleClose = () => {
    revokeBlobUrl();
    reset();
    setImageFile(null);
    setImagePreview(null);
    onClose();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      revokeBlobUrl();
      const url = URL.createObjectURL(file);
      blobUrlRef.current = url;
      setImageFile(file);
      setImagePreview(url);
    }
  };

  const removeImage = () => {
    revokeBlobUrl();
    setImageFile(null);
    setImagePreview(null);
  };

  const handleCreateCategory = async () => {
    if (!categoryName.trim()) { setCategoryError('Ingresa un nombre'); return; }
    if (!onCreateCategory) return;
    setCategorySubmitting(true);
    setCategoryError('');
    const newId = await onCreateCategory(categoryName.trim());
    setCategorySubmitting(false);
    if (newId) {
      setField('categoryId', newId);
      setShowCreateCategory(false);
      setCategoryName('');
    } else {
      setCategoryError('Error al crear categoría');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditing ? 'Editar producto' : 'Nuevo producto'}
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="ghost" fullWidth onClick={handleClose}>
            Cancelar
          </Button>
          <Button variant="primary" fullWidth onClick={formSubmit} loading={isSubmitting}>
            {isEditing ? 'Guardar cambios' : presentations.length > 0 ? 'Crear con presentaciones' : 'Crear producto'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Section: Identidad */}
        <SectionDivider icon={<Package size={14} className="text-primary" />} title="Identidad" />

        <div className="flex items-center gap-3">
          {imagePreview ? (
            <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 border-primary/20 shadow-sm">
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-0 right-0 w-5 h-5 bg-gray-900/60 text-white rounded-bl-lg flex items-center justify-center hover:bg-danger transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <label className="w-14 h-14 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all shrink-0">
              <ImagePlus size={18} className="text-gray-400" />
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} />
            </label>
          )}
          <div className="flex-1 min-w-0">
            <Input
              placeholder="Nombre del producto"
              value={formData.name}
              onChange={(e) => setField('name', e.target.value)}
              error={errors.name}
              validation={{ required: true, maxLength: 25 }}
              inputClassName="text-sm"
            />
          </div>
        </div>
        <p className="text-[10px] text-gray-400 -mt-2">JPG, PNG o WebP. Se comprime automáticamente.</p>

        {/* Section: Precio y Código */}
        <SectionDivider icon={<DollarSign size={14} className="text-primary" />} title="Precio y código" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="input-wrapper">
            <label className="input-label">Código de barras (SKU)</label>
            <div className="flex items-center gap-1">
              <Input
                placeholder="Ej: HP-001"
                value={formData.sku}
                onChange={(e) => setField('sku', e.target.value)}
                error={errors.sku}
                validation={{ required: true, maxLength: 14 }}
                inputClassName="text-sm"
              />
              <Button variant="outline" size="sm" onClick={() => setShowBarcodeScanner(true)} className="shrink-0 px-2" title="Escanear código de barras">
                <Scan size={16} />
              </Button>
            </div>
          </div>
          <div className="input-wrapper">
            <label className="input-label">Precio de Venta en $</label>
            <Input
              sanitize="currency"
              step="0.01"
              placeholder="2.50"
              value={formData.priceUsd || ''}
              onChange={(e) => setField('priceUsd', parseFloat(e.target.value) || 0)}
              error={errors.priceUsd}
              validation={{ required: true, min: 0.01, max: 9999 }}
              inputClassName="text-sm"
            />
          </div>
        </div>

        {!isEditing && (
          <div className="input-wrapper">
            <label className="input-label">Costo total del lote inicial ($)</label>
            <Input
              sanitize="currency"
              step="0.01"
              placeholder="0.00"
              value={formData.costPrice || ''}
              onChange={(e) => setField('costPrice', parseFloat(e.target.value) || 0)}
              validation={{ min: 0, max: 999999 }}
              inputClassName="text-sm"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Opcional. Si se deja vacío, el lote se registra con costo $0.
            </p>
          </div>
        )}

        {/* Section: Stock y Categoría */}
        <SectionDivider icon={<Layers size={14} className="text-primary" />} title="Stock y categoría" />

        <div className="input-wrapper">
          <label className="input-label">Tipo de producto</label>
          <Select
            value={formData.productType}
            onChange={(e) => setField('productType', e.target.value as 'unidad' | 'pesable_kg' | 'pesable_lt')}
          >
            <option value="unidad">Unidad (entero)</option>
            <option value="pesable_kg">Pesable (Kg)</option>
            <option value="pesable_lt">Líquido (Lt)</option>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!isEditing && (
            <div className="input-wrapper">
              <label className="input-label">
                Stock inicial
                {formData.productType === 'pesable_kg' && ' (Kg)'}
                {formData.productType === 'pesable_lt' && ' (Lt)'}
              </label>
              <Input
                sanitize="number"
                decimals={formData.productType === 'unidad' ? 0 : 2}
                step={formData.productType === 'unidad' ? '1' : '0.01'}
                placeholder="0"
                value={formData.stockInicial || ''}
                onChange={(e) => setField('stockInicial', parseFloat(e.target.value) || 0)}
                validation={{ min: 0 }}
              />
              <p className="text-[10px] text-gray-400 mt-0.5">
                {formData.productType === 'pesable_kg' && 'Se guardará en gramos (Ej: 3.5 Kg = 3500 g)'}
                {formData.productType === 'pesable_lt' && 'Se guardará en mililitros (Ej: 1.5 Lt = 1500 ml)'}
              </p>
            </div>
          )}
          <div className={`input-wrapper ${isEditing ? 'col-span-2' : ''}`}>
            <label className="input-label">Stock mínimo (alerta)</label>
            <Input
              sanitize="number"
              decimals={0}
              placeholder="0"
              value={formData.stockMin || ''}
              onChange={(e) => setField('stockMin', parseInt(e.target.value) || undefined)}
              validation={{ min: 0, max: 999 }}
            />
          </div>
        </div>

        <div className="input-wrapper">
          <SearchableSelect
            value={formData.categoryId || ''}
            onChange={(value) => setField('categoryId', value || undefined)}
            options={[
              { value: '', label: 'Seleccionar categoría...' },
              ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
            ]}
            placeholder="Seleccionar categoría..."
            searchPlaceholder="Buscar categoría..."
            footer={
              <button
                type="button"
                onClick={() => { setShowCreateCategory(true); setCategoryName(''); setCategoryError(''); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
              >
                <Plus size={14} />
                Crear nueva categoría
              </button>
            }
          />
          {errors.categoryId && <span className="input-error-text">{errors.categoryId}</span>}
        </div>

        {/* === PRESENTACIONES === */}
        {formData.productType === 'unidad' && (
          <>
            <SectionDivider icon={<Layers size={14} className="text-primary" />} title="Presentaciones" />

            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Las presentaciones te permiten vender un mismo producto en múltiples formatos
                (ej: 24 unidades, caja de 12, etc.)
              </p>

              {presentations.length > 0 && (
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setStockType('shared')}
                    className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${
                      stockType === 'shared'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Stock compartido
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockType('independent')}
                    className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${
                      stockType === 'independent'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Stock independiente
                  </button>
                </div>
              )}

              {stockType === 'shared' && presentations.length > 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  Las presentaciones compartirán el stock del producto padre. Usa el multiplicador
                  para indicar cuántas unidades base contiene cada presentación.
                </p>
              )}

              {stockType === 'independent' && presentations.length > 0 && (
                <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                  Cada presentación tendrá su propio stock y SKU independiente. Se crearán como
                  productos separados en el inventario.
                </p>
              )}

              {presentations.map((pres, index) => (
                <div
                  key={index}
                  className="border border-border rounded-xl p-3 space-y-2 bg-white"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">
                      Presentación #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePresentation(index)}
                      className="p-1 rounded-lg hover:bg-danger/10 text-gray-400 hover:text-danger transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                      <input
                        type="text"
                        value={pres.name}
                        onChange={(e) => updatePresentation(index, 'name', e.target.value)}
                        placeholder="Ej: Caja de 12, Pack familiar"
                        className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Precio USD {pres.priceUsd > 0 ? '' : '(opcional, hereda del padre)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={pres.priceUsd || ''}
                        onChange={(e) => updatePresentation(index, 'priceUsd', parseFloat(e.target.value) || 0)}
                        placeholder={formData.priceUsd > 0 ? `$${formData.priceUsd}` : '0.00'}
                        className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>

                    {stockType === 'shared' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Multiplicador (unidades base)
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={pres.unitMultiplier}
                          onChange={(e) => updatePresentation(index, 'unitMultiplier', parseInt(e.target.value) || 1)}
                          placeholder="12"
                          className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    )}

                    {stockType === 'independent' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Stock inicial
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={pres.stockInicial ?? ''}
                          onChange={(e) => updatePresentation(index, 'stockInicial', parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Código de barras (opcional)
                      </label>
                      <input
                        type="text"
                        value={pres.barcode || ''}
                        onChange={(e) => updatePresentation(index, 'barcode', e.target.value || undefined)}
                        placeholder="Ej: 123456789012"
                        className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addPresentation}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-gray-300 text-gray-500 hover:border-primary/40 hover:text-primary transition-colors"
              >
                <Plus size={16} />
                Agregar presentación
              </button>
            </div>
          </>
        )}

        {/* Section: Configuración */}
        <SectionDivider icon={<Settings size={14} className="text-primary" />} title="Configuración" />

        <div className="input-wrapper">
          <Checkbox
            label="Producto gravado con IVA"
            checked={formData.isTaxable}
            onChange={(e) => setField('isTaxable', e.target.checked)}
          />
          <p className="text-[10px] text-gray-400 mt-0.5">
            Desmarca si el producto está exento de IVA (ej: alimentos de la cesta básica).
          </p>
        </div>

        <div className="input-wrapper">
          <Checkbox
            label="Disponible para venta"
            checked={formData.isSellable}
            onChange={(e) => setField('isSellable', e.target.checked)}
          />
          <p className="text-[10px] text-gray-400 mt-0.5">
            Desmarca si este producto es para consumo propio y no debe aparecer en el POS.
          </p>
        </div>
      </div>

      <Modal isOpen={showCreateCategory} onClose={() => setShowCreateCategory(false)} title="Nueva categoría" size="sm">
        <div className="space-y-4">
          <div className="input-wrapper">
            <label className="input-label">Nombre</label>
            <Input
              placeholder="Ej: Bebidas"
              value={categoryName}
              onChange={(e) => { setCategoryName(e.target.value); setCategoryError(''); }}
              error={categoryError}
              validation={{ required: true, maxLength: 25 }}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory(); }}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateCategory(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleCreateCategory} loading={categorySubmitting}>
              Crear
            </Button>
          </div>
        </div>
      </Modal>

      <BarcodeScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={(code) => {
          setField('sku', code);
          setShowBarcodeScanner(false);
        }}
      />
    </Modal>
  );
}
