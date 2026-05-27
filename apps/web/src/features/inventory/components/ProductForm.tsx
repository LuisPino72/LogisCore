import { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Input, Modal, Checkbox, Select, SearchableSelect } from '../../../common/components';
import { ImagePlus, Plus, X, Scan, Package, Layers, Settings, Trash2, Scale, ChevronLeft, ChevronRight, Check } from 'lucide-react';
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
  onSubmit: (data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' }, imageFile?: File | null) => Promise<boolean>;
  categories: { id: string; name: string; isPredefined?: boolean }[];
  editProduct?: { id: string; name: string; sku: string; priceUsd: number; categoryId?: string; isWeighted: boolean; unit: string; stockMin?: number; imageUrl?: string; costPrice?: number } | null;
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

  const [creationType, setCreationType] = useState<'simple' | 'weighted' | 'variants' | null>(
    isEditing ? (editProduct?.isWeighted ? 'weighted' : 'simple') : null
  );

  const initialValues = editProduct ? {
    name: editProduct.name,
    sku: editProduct.sku,
    priceUsd: editProduct.priceUsd,
    categoryId: editProduct.categoryId,
    isWeighted: editProduct.isWeighted,
    unit: editProduct.unit,
    stockMin: editProduct.stockMin,
    costPrice: editProduct.costPrice ?? 0,
  } : undefined;

  const wrappedOnSubmit = async (data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' }): Promise<boolean> => {
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
    setFormErrors,
    handleSubmit: formSubmit,
    reset,
    presentations,
    addPresentation,
    removePresentation,
    updatePresentation,
    generateSku,
  } = useProductForm({ onSubmit: wrappedOnSubmit, initialValues, editProductId: editProduct?.id });

  const hasPresentations = creationType === 'variants' || showPresentations || (isEditing && presentations.length > 0);

  useEffect(() => {
    if (isEditing && presentations.length > 0 && creationType !== 'variants') {
      setCreationType('variants');
    }
  }, [isEditing, presentations, creationType]);

  const creationSteps = [
    { id: 'type', label: 'Tipo' },
    { id: 'basic', label: 'Datos básicos' },
    { id: 'inventory', label: 'Inventario y venta' },
  ];

  const editBasicSteps = [
    { id: 'basic', label: 'Datos básicos' },
    ...(hasPresentations ? [{ id: 'variants', label: 'Variantes' }] : []),
  ];

  const steps = isEditing ? editBasicSteps : creationSteps;
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
    setCreationType(null);
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
    const stepIndex = isEditing ? currentStep + 1 : currentStep;
    if (stepIndex === 1) {
      const errs: Record<string, string> = {};
      if (!formData.name.trim()) errs.name = 'El nombre es obligatorio';
      if (Object.keys(errs).length > 0) {
        setFormErrors(errs);
        return;
      }
    }
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, totalSteps, formData.name, setFormErrors, isEditing]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    } else {
      handleClose();
    }
  }, [currentStep, handleClose]);

  const renderTypeSelector = () => (
    <div className="grid grid-cols-1 gap-3 animate-fade-in">
      <button
        type="button"
        onClick={() => {
          setCreationType('simple');
          setShowPresentations(false);
          setField('productType', 'unidad');
          setCurrentStep(1);
        }}
        className="group relative flex items-start gap-4 p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-primary/40 hover:bg-primary/2 hover:shadow-sm transition-all duration-200 text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
          <Package size={20} className="text-primary" />
        </div>
        <div className="min-w-0">
          <span className="block text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors">Producto simple</span>
          <span className="block text-xs text-gray-500 mt-0.5">Una sola presentación. Venta por unidad.</span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => {
          setCreationType('weighted');
          setShowPresentations(false);
          setField('productType', 'pesable_kg');
          setCurrentStep(1);
        }}
        className="group relative flex items-start gap-4 p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-primary/40 hover:bg-primary/2 hover:shadow-sm transition-all duration-200 text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
          <Scale size={20} className="text-primary" />
        </div>
        <div className="min-w-0">
          <span className="block text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors">Producto pesable</span>
          <span className="block text-xs text-gray-500 mt-0.5">Se vende por peso o volumen. Kg o litros.</span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => {
          setCreationType('variants');
          setShowPresentations(true);
          setField('productType', 'unidad');
          setCurrentStep(1);
        }}
        className="group relative flex items-start gap-4 p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-primary/40 hover:bg-primary/2 hover:shadow-sm transition-all duration-200 text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
          <Layers size={20} className="text-primary" />
        </div>
        <div className="min-w-0">
          <span className="block text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors">Producto con variantes</span>
          <span className="block text-xs text-gray-500 mt-0.5">Múltiples presentaciones: caja, pack, sabores.</span>
        </div>
      </button>
    </div>
  );

  const renderBasicInfoStep = () => (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
          <Package size={14} className="text-primary" />
        </div>
        <h3 className="text-xs font-title font-semibold text-gray-700 uppercase tracking-wide">Datos básicos</h3>
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
          <Button variant="outline" size="sm" onClick={generateSku} className="shrink-0 px-2 text-xs" title="Generar SKU automático">
            Auto
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowBarcodeScanner(true)} className="shrink-0 px-2" title="Escanear código de barras">
            <Scan size={16} />
          </Button>
        </div>
      </div>

       {isEditing && (
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

  const renderInventoryStep = () => {
    const isVariants = creationType === 'variants';

    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            {isVariants ? <Layers size={14} className="text-primary" /> : <Settings size={14} className="text-primary" />}
          </div>
          <h3 className="text-xs font-title font-semibold text-gray-700 uppercase tracking-wide">
            {isVariants ? 'Variantes' : 'Inventario y venta'}
          </h3>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {!isVariants && (
          <>
            {creationType === 'weighted' && (
              <div className="input-wrapper">
                <label className="input-label">Unidad de medida</label>
                <Select
                  value={formData.productType}
                  onChange={(e) => setField('productType', e.target.value as 'unidad' | 'pesable_kg' | 'pesable_lt')}
                >
                  <option value="pesable_kg">Kilogramos (Kg)</option>
                  <option value="pesable_lt">Litros (Lt)</option>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="input-wrapper">
                <label className="input-label">Precio de venta $</label>
                <Input
                  sanitize="currency"
                  step="0.01"
                  placeholder="2.50"
                  value={formData.priceUsd != null && formData.priceUsd > 0 ? String(formData.priceUsd) : ''}
                  onChange={(e) => setField('priceUsd', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  error={errors.priceUsd}
                  validation={{ required: true, min: 0.05, max: 9999 }}
                  inputClassName="text-sm"
                />
              </div>

              <div className="input-wrapper">
                <label className="input-label">Costo total del lote inicial ($)</label>
                <Input
                  sanitize="currency"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.costPrice != null && formData.costPrice > 0 ? String(formData.costPrice) : ''}
                  onChange={(e) => setField('costPrice', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  inputClassName="text-sm"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Costo total pagado por la primera entrada de stock. Se divide entre el stock para calcular el costo por unidad.</p>
              </div>

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
          </>
        )}

        {isVariants && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="input-wrapper">
                <label className="input-label">Stock general (unidades base)</label>
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
                <label className="input-label">Costo total del lote ($)</label>
                <Input
                  sanitize="currency"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.costPrice != null ? String(formData.costPrice) : ''}
                  onChange={(e) => setField('costPrice', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  validation={{ min: 0, max: 999999 }}
                  inputClassName="text-sm"
                />
              </div>
            </div>

            <div className="space-y-3">
              {presentations.map((pres, index) => (
                <div
                  key={index}
                  className="border border-border rounded-xl p-4 space-y-3 bg-white hover:border-primary/20 hover:shadow-sm transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Variante #{index + 1}</span>
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
                        validation={{ required: true, maxLength: 100 }}
                        inputClassName="text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Precio $</label>
                      <Input
                        sanitize="currency"
                        step="0.01"
                        placeholder="0.00"
                        value={pres.priceUsd != null ? String(pres.priceUsd) : ''}
                        onChange={(e) => updatePresentation(index, 'priceUsd', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        validation={{ min: 0.01 }}
                        inputClassName="text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Equivale a (unidades)</label>
                      <Input
                        sanitize="number"
                        decimals={0}
                        placeholder="12"
                        value={pres.unitMultiplier?.toString() || ''}
                        onChange={(e) => updatePresentation(index, 'unitMultiplier', e.target.value === '' ? 1 : parseInt(e.target.value) || 1)}
                        validation={{ min: 1 }}
                        inputClassName="text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">SKU</label>
                      <Input
                        placeholder="Ej: HP-001-A"
                        value={pres.barcode || ''}
                        onChange={(e) => updatePresentation(index, 'barcode', e.target.value || undefined)}
                        inputClassName="text-sm"
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
                Agregar variante
              </button>
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
          </>
        )}
      </div>
    );
  };

  const renderEditVariantsStep = () => (
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
          . Comparten el stock del producto base.
        </p>

        {presentations.map((pres, index) => (
          <div
            key={index}
            className="border border-border rounded-xl p-4 space-y-3 bg-white hover:border-primary/20 hover:shadow-sm transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Variante #{index + 1}</span>
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
                  validation={{ required: true, maxLength: 100 }}
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
                  validation={{ min: 0.01 }}
                  inputClassName="text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Multiplicador (unidades base) <span className="text-gray-400">— fijo</span>
                </label>
                <Input
                  sanitize="number"
                  decimals={0}
                  disabled
                  placeholder="12"
                  value={pres.unitMultiplier?.toString() || ''}
                  inputClassName="text-sm opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Código de barras (opcional)
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

  const renderStepContent = () => {
    if (isEditing) {
      if (currentStep === 0) return renderBasicInfoStep();
      if (currentStep === 1 && hasPresentations) return renderEditVariantsStep();
      return renderBasicInfoStep();
    }

    switch (currentStep) {
      case 0: return renderTypeSelector();
      case 1: return renderBasicInfoStep();
      case 2: return renderInventoryStep();
      default: return null;
    }
  };

  const handleFinalSubmit = async () => {
    const result = await formSubmit();
    if (!result.success && result.errors) {
      const errors = result.errors;
      const basicFields = ['name', 'sku', 'categoryId'];
      const hasBasicError = basicFields.some(field => !!errors[field]);

      if (hasBasicError && currentStep === 2) {
        setCurrentStep(1);
      }
    }
  };

  const renderFooter = () => {
    const isLastStep = currentStep === totalSteps - 1;
    const isTypeStep = !isEditing && currentStep === 0;

    if (isTypeStep) {
      return (
        <div className="flex w-full">
          <Button variant="ghost" fullWidth onClick={handleClose}>
            Cancelar
          </Button>
        </div>
      );
    }

    return (
      <div className="flex gap-3 w-full">
        <Button variant="outline" fullWidth={false} onClick={goBack}>
          <ChevronLeft size={16} />
          Atrás
        </Button>

        {isLastStep ? (
          <Button variant="primary" fullWidth onClick={handleFinalSubmit} loading={isSubmitting}>
            <Check size={16} />
            {isEditing ? 'Guardar cambios' : 'Crear producto'}
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
