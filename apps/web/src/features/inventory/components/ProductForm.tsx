import { useState, useRef, useCallback } from 'react';
import { Button, Input, Modal, Checkbox, Select, SearchableSelect } from '../../../common/components';
import { ImagePlus, Plus, X, Scan, Package, Layers, Settings, Trash2, Share2, FolderOpen, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useProductForm } from '../hooks/useProductForm';
import { BarcodeScannerModal } from '../../shared/components/BarcodeScannerModal';
import type { CreateProductInput, CreatePresentationInput } from '../types';

function StepIndicator({ current, steps }: { current: number; steps: { id: string; label: string }[] }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6 px-2">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                i <= current
                  ? 'bg-primary text-white shadow-sm shadow-primary/30'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i < current ? <Check size={14} /> : i + 1}
            </div>
            <span
              className={`text-[10px] mt-1.5 font-medium whitespace-nowrap transition-colors duration-200 hidden sm:block ${
                i === current
                  ? 'text-gray-800 font-semibold'
                  : i < current
                  ? 'text-primary'
                  : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-6 sm:w-10 h-[2px] mx-1 mb-5 rounded-full transition-colors duration-500 ${
                i < current ? 'bg-primary' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

interface ProductFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' | 'independent' }, imageFile?: File | null) => Promise<boolean>;
  categories: { id: string; name: string; isPredefined?: boolean }[];
  editProduct?: { id: string; name: string; sku: string; priceUsd: number; categoryId?: string; isWeighted: boolean; unit: string; stockMin?: number; imageUrl?: string } | null;
  onCreateCategory?: (name: string) => Promise<string | null>;
}

export function ProductForm({ isOpen, onClose, onSubmit, categories, editProduct, onCreateCategory }: ProductFormProps) {
  const isEditing = !!editProduct;
  const [currentStep, setCurrentStep] = useState(0);
  const [showPresentations, setShowPresentations] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(editProduct?.imageUrl ?? null);
  const blobUrlRef = useRef<string | null>(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

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

  const hasPresentations = showPresentations || (isEditing && presentations.length > 0);

  const createSteps = hasPresentations
    ? [{ id: 'identity', label: 'Datos básicos' }, { id: 'stock', label: 'Stock' }, { id: 'variants', label: 'Variantes' }]
    : [{ id: 'identity', label: 'Datos básicos' }, { id: 'stock', label: 'Stock' }];

  const editSteps = hasPresentations
    ? [{ id: 'identity', label: 'Datos básicos' }, { id: 'variants', label: 'Variantes' }]
    : [{ id: 'identity', label: 'Datos básicos' }];

  const steps = isEditing ? editSteps : createSteps;
  const totalSteps = steps.length;

  const revokeBlobUrl = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  };

  const hasUnsavedChanges = (): boolean => {
    if (isEditing) return true;
    return !!(
      formData.name || formData.sku || formData.priceUsd > 0 ||
      formData.stockInicial > 0 || formData.stockMin ||
      presentations.length > 0 || imageFile || imagePreview
    );
  };

  const performClose = () => {
    revokeBlobUrl();
    reset();
    setImageFile(null);
    setImagePreview(null);
    setShowDiscardConfirm(false);
    setCurrentStep(0);
    setShowPresentations(false);
    onClose();
  };

  const handleClose = () => {
    if (hasUnsavedChanges()) {
      setShowDiscardConfirm(true);
      return;
    }
    performClose();
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

  const goNext = useCallback(() => {
    if (currentStep === 0) {
      if (!formData.name.trim()) {
        setField('name', formData.name);
        return;
      }
      if (!formData.sku.trim()) {
        setField('sku', formData.sku);
        return;
      }
    }
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, totalSteps, formData.name, formData.sku, setField]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const renderStepContent = () => {
    if (isEditing) {
      switch (currentStep) {
        case 0: return renderIdentityStep(true);
        case 1: return renderVariantsStep();
        default: return null;
      }
    }

    switch (currentStep) {
      case 0: return renderIdentityStep(false);
      case 1: return renderStockStep();
      case 2: return renderVariantsStep();
      default: return null;
    }
  };

  const renderIdentityStep = (isEdit: boolean) => (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
          <Package size={14} className="text-primary" />
        </div>
        <h3 className="text-xs font-title font-semibold text-gray-700 uppercase tracking-wide">Identidad</h3>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

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
            value={formData.priceUsd != null ? String(formData.priceUsd) : ''}
            onChange={(e) => setField('priceUsd', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
            error={errors.priceUsd}
            validation={{ required: true, min: 0.05, max: 9999 }}
            inputClassName="text-sm"
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

      {isEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="input-wrapper">
            <label className="input-label">Tipo de producto</label>
            <Select disabled value={formData.productType}>
              <option value="unidad">Unidad (entero)</option>
              <option value="pesable_kg">Pesable (Kg)</option>
              <option value="pesable_lt">Líquido (Lt)</option>
            </Select>
          </div>
          <div className="input-wrapper">
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
      )}
    </div>
  );

  const renderStockStep = () => (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
          <Layers size={14} className="text-primary" />
        </div>
        <h3 className="text-xs font-title font-semibold text-gray-700 uppercase tracking-wide">Configuración de Stock</h3>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

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

      {formData.productType === 'unidad' && (
        <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                <Share2 size={12} className="text-primary" />
              </div>
              <span className="text-sm font-medium text-gray-700">¿Tiene presentaciones o variantes?</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showPresentations}
                onChange={(e) => {
                  setShowPresentations(e.target.checked);
                  if (!e.target.checked && presentations.length === 0) {
                    setCurrentStep(1);
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
            </label>
          </div>
          <p className="text-xs text-gray-500">
            Activa esta opción si el producto se vende en múltiples formatos (ej: unidad, caja de 12, pack familiar).
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!showPresentations && (
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
        <div className={`input-wrapper ${showPresentations ? 'col-span-2' : ''}`}>
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

      {showPresentations && (
        <>
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setStockType('shared');
                setField('stockInicial', 0);
              }}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                stockType === 'shared'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Share2 size={16} />
              Stock compartido
            </button>
            <button
              type="button"
              onClick={() => {
                setStockType('independent');
              }}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                stockType === 'independent'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FolderOpen size={16} />
              Stock independiente
            </button>
          </div>

          {stockType === 'shared' && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700">
                  Las variantes compartirán el stock del producto base. El multiplicador indica cuántas unidades base equivalen a una unidad de la variante.
                </p>
              </div>
              <div className="input-wrapper">
                <label className="input-label">Stock inicial (unidades base)</label>
                <Input
                  sanitize="number"
                  decimals={0}
                  placeholder="0"
                  value={formData.stockInicial || ''}
                  onChange={(e) => setField('stockInicial', parseFloat(e.target.value) || 0)}
                  validation={{ min: 0 }}
                />
              </div>
              <div className="input-wrapper">
                <label className="input-label">Costo total del lote inicial ($)</label>
                <Input
                  sanitize="currency"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.costPrice != null ? String(formData.costPrice) : ''}
                  onChange={(e) => setField('costPrice', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  validation={{ min: 0, max: 999999 }}
                  inputClassName="text-sm"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Opcional. Si se deja vacío, el lote se registra con costo $0.
                </p>
              </div>
            </div>
          )}

          {stockType === 'independent' && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  Cada variante tendrá su propio stock y SKU independiente. Define su stock inicial en el siguiente paso. El producto base quedará sin stock.
                </p>
              </div>
              <div className="input-wrapper">
                <label className="input-label">Costo total del lote inicial ($)</label>
                <Input
                  sanitize="currency"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.costPrice != null ? String(formData.costPrice) : ''}
                  onChange={(e) => setField('costPrice', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  validation={{ min: 0, max: 999999 }}
                  inputClassName="text-sm"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Costo total distribuido entre todas las variantes según su stock inicial.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderVariantsStep = () => (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
          <Layers size={14} className="text-primary" />
        </div>
        <h3 className="text-xs font-title font-semibold text-gray-700 uppercase tracking-wide">Variantes</h3>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Define las variantes o formatos de venta de este producto
          {stockType === 'shared' ? '. Compartirán el stock del producto base.' : '. Cada una tendrá su propio stock independiente.'}
        </p>

        {isEditing && stockType === 'shared' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700">
              Solo puedes editar el nombre y precio de las variantes. El multiplicador y el stock no se modifican desde aquí.
            </p>
          </div>
        )}

        {presentations.map((pres, index) => (
          <div
            key={index}
            className="border border-border rounded-xl p-4 space-y-3 bg-white hover:border-primary/20 hover:shadow-sm transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">
                Variante #{index + 1}
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
                <Input
                  placeholder="Ej: Caja de 12, Pack familiar"
                  value={pres.name}
                  onChange={(e) => updatePresentation(index, 'name', e.target.value)}
                  inputClassName="text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Precio $</label>
                <Input
                  sanitize="currency"
                  step="0.01"
                  placeholder={formData.priceUsd > 0 ? `$${formData.priceUsd}` : '0.00'}
                  value={pres.priceUsd != null ? String(pres.priceUsd) : ''}
                  onChange={(e) => updatePresentation(index, 'priceUsd', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  inputClassName="text-sm"
                />
              </div>

              {stockType === 'shared' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Multiplicador (unidades base) {isEditing && <span className="text-gray-400">— fijo</span>}
                  </label>
                  <Input
                    sanitize="number"
                    decimals={0}
                    disabled={isEditing}
                    placeholder="12"
                    value={pres.unitMultiplier?.toString() || ''}
                    onChange={(e) => updatePresentation(index, 'unitMultiplier', e.target.value === '' ? 1 : parseInt(e.target.value) || 1)}
                    inputClassName={`text-sm ${isEditing ? 'opacity-60' : ''}`}
                  />
                </div>
              )}

              {stockType === 'independent' && !isEditing && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Stock inicial</label>
                  <Input
                    sanitize="number"
                    decimals={0}
                    placeholder="0"
                    value={pres.stockInicial?.toString() || ''}
                    onChange={(e) => updatePresentation(index, 'stockInicial', parseInt(e.target.value) || 0)}
                    inputClassName="text-sm"
                  />
                </div>
              )}

              {stockType === 'independent' && isEditing && pres.stockInicial !== undefined && (
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-500">Stock inicial: </span>
                  <span className="text-sm font-medium text-gray-700">{pres.stockInicial} unid.</span>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Código de barras {stockType === 'independent' ? '(será el SKU)' : '(opcional)'}
                </label>
                <Input
                  placeholder="Ej: 123456789012"
                  value={pres.barcode || ''}
                  onChange={(e) => updatePresentation(index, 'barcode', e.target.value || undefined)}
                  inputClassName="text-sm"
                />
              </div>
            </div>
          </div>
        ))}

        {(stockType === 'shared' || !isEditing) && (
          <button
            type="button"
            onClick={addPresentation}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-gray-300 text-gray-500 hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Plus size={16} />
            Agregar variante
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
        <Settings size={14} className="text-gray-400 shrink-0" />
        <div className="flex-1 space-y-1">
          <Checkbox
            label="Producto gravado con IVA"
            checked={formData.isTaxable}
            onChange={(e) => setField('isTaxable', e.target.checked)}
          />
          <Checkbox
            label="Disponible para venta"
            checked={formData.isSellable}
            onChange={(e) => setField('isSellable', e.target.checked)}
          />
        </div>
      </div>
    </div>
  );

  const renderFooter = () => {
    const isLastStep = currentStep === totalSteps - 1;

    return (
      <div className="flex gap-3 w-full">
        {currentStep > 0 ? (
          <Button variant="outline" fullWidth={false} onClick={goBack}>
            <ChevronLeft size={16} />
            Atrás
          </Button>
        ) : (
          <Button variant="ghost" fullWidth onClick={handleClose}>
            Cancelar
          </Button>
        )}

        {isLastStep ? (
          <Button variant="primary" fullWidth onClick={formSubmit} loading={isSubmitting}>
            {isEditing ? 'Guardar cambios' : presentations.length > 0 ? 'Crear producto' : 'Crear producto'}
          </Button>
        ) : (
          <Button variant="primary" fullWidth onClick={goNext}>
            Siguiente
            <ChevronRight size={16} />
          </Button>
        )}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditing ? 'Editar producto' : 'Nuevo producto'}
      footer={renderFooter()}
    >
      <div className="space-y-4">
        <StepIndicator current={currentStep} steps={steps} />
        <div key={currentStep} className="animate-fade-in">
          {renderStepContent()}
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

      <Modal isOpen={showDiscardConfirm} onClose={() => setShowDiscardConfirm(false)} title="¿Descartar cambios?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {isEditing
              ? 'Los cambios que hiciste no se guardarán. ¿Estás seguro?'
              : 'El producto no se ha guardado. ¿Estás seguro de que quieres salir?'}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowDiscardConfirm(false)}>
              Seguir editando
            </Button>
            <Button variant="danger" onClick={performClose}>
              Descartar
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
