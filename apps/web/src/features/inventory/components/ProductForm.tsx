import { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Input, Modal, Checkbox, Select, SearchableSelect, Tooltip } from '../../../common/components';
import { ImagePlus, Plus, X, Scan, Package, Layers, Settings, Trash2, Scale, ChevronLeft, ChevronRight, Check, Camera, Image } from 'lucide-react';
import { useProductForm } from '../hooks/useProductForm';
import { BarcodeScannerModal } from '../../shared/components/BarcodeScannerModal';
import { hasCamera } from '../../../lib/camera';
import { useToastStore } from '../../../stores/toastStore';
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
              className={`text-xs mt-1.5 font-medium whitespace-nowrap transition-colors duration-200 hidden sm:block ${
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
  editProduct?: { id: string; name: string; sku: string; priceUsd: number; categoryId?: string; isWeighted: boolean; unit: string; stockMin?: number; imageUrl?: string; costPrice?: number; productType?: 'resale' | 'materia_prima' | 'producto_terminado' | 'both' } | null;
  onCreateCategory?: (name: string) => Promise<string | null>;
}

export function ProductForm({ isOpen, onClose, onSubmit, categories, editProduct, onCreateCategory }: ProductFormProps) {
  const isEditing = !!editProduct;
  const [currentStep, setCurrentStep] = useState(0);
  const [showPresentations, setShowPresentations] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(editProduct?.imageUrl || null);
  const blobUrlRef = useRef<string | null>(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [imageError, setImageError] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const presentationsErrorRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToastStore();

  const isRawMaterialEdit = isEditing && (editProduct?.productType === 'materia_prima');
  const [creationType, setCreationType] = useState<'simple' | 'weighted' | 'variants' | 'raw_material' | null>(
    isEditing
      ? isRawMaterialEdit
        ? 'raw_material'
        : editProduct?.isWeighted
        ? 'weighted'
        : null
      : null
  );

  const initialValues = editProduct ? {
    name: editProduct.name,
    sku: editProduct.sku,
    priceUsd: editProduct.priceUsd,
    categoryId: editProduct.categoryId,
    isWeighted: editProduct.isWeighted,
    unit: editProduct.unit,
    stockMin: editProduct.stockMin != null
      ? (editProduct.isWeighted
          ? (editProduct.unit === 'lt' ? Math.round(editProduct.stockMin / 1000) : Math.round(editProduct.stockMin / 1000))
          : editProduct.stockMin)
      : undefined,
    costPrice: editProduct.costPrice ?? 0,
    imageUrl: editProduct.imageUrl || undefined,
    isRawMaterial: editProduct.productType !== 'resale' && editProduct.productType != null,
    productionType: editProduct.productType !== 'resale' && editProduct.productType != null ? ('materia_prima' as const) : undefined,
  } : undefined;

  const wrappedOnSubmit = async (data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' }): Promise<boolean> => {
    if (!imageFile && !imagePreview && editProduct?.imageUrl) {
      data.imageUrl = '';
    }
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
    presentationsLoading,
    addPresentation,
    removePresentation,
    updatePresentation,
    generateSku,
  } = useProductForm({ onSubmit: wrappedOnSubmit, initialValues, editProductId: editProduct?.id, creationType });

  const hasPresentations = creationType === 'variants' || showPresentations || (isEditing && presentations.length > 0);

  useEffect(() => {
    if (isEditing && presentations.length > 0 && creationType !== 'variants') {
      setCreationType('variants');
    }
  }, [isEditing, presentations, creationType]);

  useEffect(() => {
    if (showImagePicker) {
      hasCamera().then(setCameraAvailable);
    }
  }, [showImagePicker]);

  const creationSteps = creationType === 'raw_material'
    ? [
        { id: 'type', label: 'Tipo' },
        { id: 'basic', label: 'Datos básicos' },
        { id: 'inventory', label: 'Inventario' },
      ]
    : [
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

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageError('');
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setImageError('Formato no válido. Usa JPG, PNG o WebP.');
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setImageError('La imagen es muy grande. Máximo 10MB.');
        return;
      }
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
      setCategoryError('Error al crear categoría. Verifica tu conexión e intenta de nuevo.');
    }
  };

  const goNext = useCallback(() => {
    const stepIndex = isEditing ? currentStep + 1 : currentStep;
    if (stepIndex === 1) {
      const errs: Record<string, string> = {};
      if (!formData.name.trim()) errs.name = 'El nombre es obligatorio';
      if (!formData.categoryId) errs.categoryId = 'Debes seleccionar una categoría';
      if (Object.keys(errs).length > 0) {
        setFormErrors(errs);
        return;
      }
    }
    if (stepIndex === 2 && creationType === 'variants' && presentations.length === 0) {
      setFormErrors({ presentations: 'Debes agregar al menos una variante para continuar' });
      return;
    }
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, totalSteps, formData.name, formData.categoryId, creationType, presentations.length, setFormErrors, isEditing]);

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
          <span className="block text-xs text-gray-500 mt-0.5">Se vende por peso (Kg), Litros (Lt) o Metros (m)</span>
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

      <button
        type="button"
        onClick={() => {
          setCreationType('raw_material');
          setShowPresentations(false);
          setField('productType', 'raw_material');
          setCurrentStep(1);
        }}
        className="group relative flex items-start gap-4 p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-amber-400 hover:bg-amber-50 hover:shadow-sm transition-all duration-200 text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-15 transition-colors">
          <svg width="20" height="20" className="text-amber-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/>
            <path d="M8.5 2h7"/>
            <path d="M7 16.5h10"/>
          </svg>
        </div>
        <div className="min-w-0">
          <span className="block text-sm font-semibold text-gray-800 group-hover:text-amber-600 transition-colors">Materia prima</span>
          <span className="block text-xs text-gray-500 mt-0.5">Ingrediente para producción. No se vende.</span>
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
              className="absolute top-0.5 right-0.5 w-6 h-6 flex items-center justify-center bg-gray-900/70 text-white rounded-md hover:bg-danger transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowImagePicker(true)}
            className="w-14 h-14 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all shrink-0"
          >
            <ImagePlus size={18} className="text-gray-400" />
          </button>
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
      <p className="text-xs text-gray-600 -mt-2">JPG, PNG o WebP. Se comprime automáticamente.</p>
      {imageError && (
        <p className="text-[11px] text-danger -mt-1">{imageError}</p>
      )}

      <div className="input-wrapper">
        <div className="max-w-xs">
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
        </div>
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
            validation={{ required: true, maxLength: 18 }}
            inputClassName="text-sm"
          />
          <Tooltip content="Generar SKU automático" variant="help">
            <Button variant="outline" size="sm" onClick={generateSku} className="shrink-0 px-3 min-h-11 text-xs">
              Auto
            </Button>
          </Tooltip>
          <Tooltip content="Escanear código de barras" variant="help">
            <Button variant="outline" size="sm" onClick={() => setShowBarcodeScanner(true)} className="shrink-0 px-3 min-h-11">
              <Scan size={16} />
            </Button>
          </Tooltip>
        </div>
      </div>

       {isEditing && isRawMaterialEdit && (
         <div className="grid grid-cols-1 gap-3">
            <div className="input-wrapper">
              <label className="input-label">
                Stock mínimo (alerta)
                {editProduct?.unit === 'kg' && ' (Kg)'}
                {editProduct?.unit === 'lt' && ' (Lt)'}
                {editProduct?.unit === 'm' && ' (m)'}
              </label>
              <Input
                sanitize="number"
                decimals={0}
                placeholder="0"
                value={formData.stockMin || ''}
                onChange={(e) => setField('stockMin', parseInt(e.target.value) || undefined)}
                validation={{ min: 0, max: 999 }}
                inputMode="numeric"
              />
            </div>
          </div>
        )}

        {isEditing && !isRawMaterialEdit && (
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
           <div className="input-wrapper">
             <label className="input-label">Precio de venta en $</label>
              <Input
                sanitize="currency"
                step="0.01"
                placeholder="2.50"
                value={formData.priceUsd != null && formData.priceUsd > 0 ? String(formData.priceUsd) : ''}
                onChange={(e) => setField('priceUsd', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                error={errors.priceUsd}
                validation={{ required: true, min: 0.05, max: 9999 }}
                inputClassName="text-sm"
                inputMode="decimal"
              />
           </div>
            <div className="input-wrapper">
              <label className="input-label">
                Stock mínimo (alerta)
                {editProduct?.isWeighted && editProduct?.unit === 'kg' && ' (Kg)'}
                {editProduct?.isWeighted && editProduct?.unit === 'lt' && ' (Lt)'}
                {editProduct?.isWeighted && editProduct?.unit === 'm' && ' (m)'}
              </label>
              <Input
                sanitize="number"
                decimals={0}
                placeholder="0"
                value={formData.stockMin || ''}
                onChange={(e) => setField('stockMin', parseInt(e.target.value) || undefined)}
                validation={{ min: 0, max: 999 }}
                inputMode="numeric"
              />
           </div>
         </div>
       )}
    </div>
  );

  const renderInventoryStep = () => {
    const isVariants = creationType === 'variants';
    const isRawMaterial = creationType === 'raw_material';

    // Formulario simplificado para materia prima
    if (isRawMaterial) {
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center">
              <svg width="14" height="14" className="text-amber-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/>
                <path d="M8.5 2h7"/>
                <path d="M7 16.5h10"/>
              </svg>
            </div>
            <h3 className="text-xs font-title font-semibold text-amber-700 uppercase tracking-wide">Inventario - Materia Prima</h3>
            <div className="flex-1 h-px bg-amber-200" />
          </div>

          <div className="input-wrapper">
            <label className="input-label">Unidad de medida</label>
            <Select
              className="max-w-xs"
              value={formData.unit}
              onChange={(e) => {
                const unit = e.target.value;
                setField('unit', unit);
                if (creationType === 'raw_material') {
                  // Materia prima pesada (kg/lt/m) SÍ necesita isWeighted para conversión stock
                  setField('isWeighted', unit === 'kg' || unit === 'lt' || unit === 'm');
                } else {
                  setField('isWeighted', unit === 'kg' || unit === 'lt' || unit === 'm');
                  setField('productType', unit === 'kg' ? 'pesable_kg' : unit === 'lt' ? 'pesable_lt' : unit === 'm' ? 'pesable_m' : 'unidad');
                }
              }}
            >
              <option value="kg">Kilogramos (Kg)</option>
              <option value="lt">Litros (Lt)</option>
              <option value="m">Metros (m)</option>
              <option value="unidad">Unidad</option>
            </Select>
            <p className="text-xs text-gray-600 mt-0.5">
              {formData.unit === 'kg' && 'Se guardará en gramos (Ej: 3.5 Kg = 3500 g)'}
              {formData.unit === 'lt' && 'Se guardará en mililitros (Ej: 1.5 Lt = 1500 ml)'}
              {formData.unit === 'm' && 'Se guardará en milímetros (Ej: 1.5 m = 1500 mm)'}
              {formData.unit === 'unidad' && 'Se guarda como unidades enteras'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="input-wrapper">
              <label className="input-label">
                Costo de la compra $
              </label>
              <Input
                sanitize="currency"
                step="0.01"
                placeholder="0.00"
                value={formData.costPrice > 0 ? String(formData.costPrice) : ''}
                onChange={(e) => setField('costPrice', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                error={errors.costPrice}
                validation={{ required: true, min: 0.01, max: 9999.99 }}
                inputClassName="text-sm"
                inputMode="decimal"
              />
              <p className="text-xs text-gray-600 mt-0.5">
                Se dividirá automáticamente entre el stock inicial para obtener el costo por unidad.
              </p>
            </div>

            <div className="input-wrapper">
              <label className="input-label">
                Stock inicial
                {formData.unit === 'kg' && ' (Kg)'}
                {formData.unit === 'lt' && ' (Lt)'}
                {formData.unit === 'm' && ' (m)'}
              </label>
              <Input
                sanitize="number"
                decimals={formData.unit === 'unidad' ? 0 : 2}
                step={formData.unit === 'unidad' ? '1' : '0.01'}
                placeholder={formData.unit === 'unidad' ? 'Ej: 100' : 'Ej: 10.5'}
                value={formData.stockInicial || ''}
                onChange={(e) => setField('stockInicial', parseFloat(e.target.value) || 0)}
                error={errors.stockInicial}
                validation={{ required: true, min: 0.01 }}
                inputClassName="text-sm"
                inputMode="decimal"
              />
              <p className="text-xs text-gray-600 mt-0.5">
                {formData.unit === 'kg' && 'Cantidad inicial en kilogramos'}
                {formData.unit === 'lt' && 'Cantidad inicial en litros'}
                {formData.unit === 'm' && 'Cantidad inicial en metros'}
                {formData.unit === 'unidad' && 'Cantidad inicial en unidades'}
              </p>
            </div>

            <div className="input-wrapper">
              <label className="input-label">
                Stock mínimo (alerta)
                {formData.unit === 'kg' && ' (Kg)'}
                {formData.unit === 'lt' && ' (Lt)'}
                {formData.unit === 'm' && ' (m)'}
              </label>
              <Input
                sanitize="number"
                decimals={0}
                placeholder="0"
                value={formData.stockMin || ''}
                onChange={(e) => setField('stockMin', parseInt(e.target.value) || undefined)}
                validation={{ min: 0, max: 999 }}
                error={errors.stockMin}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <svg width="14" height="14" className="text-amber-600 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" x2="12" y1="8" y2="12"/>
              <line x1="12" x2="12.01" y1="16" y2="16"/>
            </svg>
            <div className="flex-1">
              <p className="text-xs font-medium text-amber-800">Materia prima para producción</p>
              <p className="text-xs text-amber-600 mt-0.5">Este producto no aparece en el POS. Se usa como ingrediente en recetas de producción.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <svg width="14" height="14" className="text-blue-600 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <div className="flex-1">
              <p className="text-xs font-medium text-blue-800">Características automáticas</p>
              <ul className="text-xs text-blue-600 mt-0.5 space-y-0.5">
                <li>• No disponible para venta (POS)</li>
                <li>• Sin impuestos (IVA)</li>
                <li>• Costo requerido para cálculos FIFO</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

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
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3">
                <div className="input-wrapper">
                  <label className="input-label">Unidad de medida</label>
                  <Select
                    value={formData.productType}
                    onChange={(e) => setField('productType', e.target.value as 'unidad' | 'pesable_kg' | 'pesable_lt' | 'pesable_m')}
                  >
                    <option value="pesable_kg">Kilogramos (Kg)</option>
                    <option value="pesable_lt">Litros (Lt)</option>
                    <option value="pesable_m">Metros (m)</option>
                  </Select>
                </div>
                <div className="input-wrapper">
                  <label className="input-label">Opciones</label>
                  <div className="flex items-center gap-4 h-10.5 px-3 border border-gray-300 rounded-lg bg-surface-alt">
                    <Checkbox
                      label="IVA"
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
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="input-wrapper">
                <label className="input-label">Precio de venta en $</label>
                <Input
                  sanitize="currency"
                  step="0.01"
                  placeholder="2.50"
                  value={formData.priceUsd != null && formData.priceUsd > 0 ? String(formData.priceUsd) : ''}
                  onChange={(e) => setField('priceUsd', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  error={errors.priceUsd}
                  validation={{ required: true, min: 0.05, max: 9999 }}
                  inputClassName="text-sm"
                  inputMode="decimal"
                />
              </div>

              <div className="input-wrapper">
                <label className="input-label">Costo total del lote $</label>
                <Input
                  sanitize="currency"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.costPrice != null && formData.costPrice > 0 ? String(formData.costPrice) : ''}
                  onChange={(e) => setField('costPrice', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  validation={{ min: 0, max: 9999.99 }}
                  inputClassName="text-sm"
                  inputMode="decimal"
                />
                <p className="text-xs text-gray-600 mt-0.5">Costo total pagado por el lote.</p>
              </div>

              <div className="input-wrapper">
                <label className="input-label">
                  Stock inicial (Cantidad)
                  {formData.productType === 'pesable_kg' && ' (Kg)'}
                  {formData.productType === 'pesable_lt' && ' (Lt)'}
                  {formData.productType === 'pesable_m' && ' (m)'}
                </label>
                <Input
                  sanitize="number"
                  decimals={formData.productType === 'unidad' ? 0 : 2}
                  step={formData.productType === 'unidad' ? '1' : '0.01'}
                  placeholder="0"
                  value={formData.stockInicial || ''}
                  onChange={(e) => setField('stockInicial', parseFloat(e.target.value) || 0)}
                  error={errors.stockInicial}
                  validation={{ min: 0 }}
                  inputMode="decimal"
                />
                <p className="text-xs text-gray-600 mt-0.5">
                  {formData.productType === 'pesable_kg' && 'Se guardará en gramos (Ej: 3.5 Kg = 3500 g)'}
                  {formData.productType === 'pesable_lt' && 'Se guardará en mililitros (Ej: 1.5 Lt = 1500 ml)'}
                  {formData.productType === 'pesable_m' && 'Se guardará en milímetros (Ej: 1.5 m = 1500 mm)'}
                </p>
              </div>

              <div className="input-wrapper">
                <label className="input-label">
                  Stock mínimo (alerta)
                  {formData.productType === 'pesable_kg' && ' (Kg)'}
                  {formData.productType === 'pesable_lt' && ' (Lt)'}
                  {formData.productType === 'pesable_m' && ' (m)'}
                </label>
                <Input
                  sanitize="number"
                  decimals={0}
                  placeholder="0"
                  value={formData.stockMin || ''}
                  onChange={(e) => setField('stockMin', parseInt(e.target.value) || undefined)}
                  validation={{ min: 0, max: 999 }}
                  error={errors.stockMin}
                  inputMode="numeric"
                />
              </div>
            </div>

            {creationType !== 'weighted' && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Settings size={14} className="text-gray-400 shrink-0" />
                <div className="flex-1 space-y-1">
                  <Checkbox
                    label="Producto con IVA"
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
            )}
          </>
        )}

        {isVariants && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="input-wrapper">
                <label className="input-label">Stock Total</label>
                <Input
                  sanitize="number"
                  decimals={0}
                  placeholder="0"
                  value={formData.stockInicial || ''}
                  onChange={(e) => setField('stockInicial', parseFloat(e.target.value) || 0)}
                  error={errors.stockInicial}
                  validation={{ min: 0 }}
                  inputMode="numeric"
                />
              </div>
              <div className="input-wrapper">
                <label className="input-label">Costo total del lote $</label>
                <Input
                  sanitize="currency"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.costPrice > 0 ? String(formData.costPrice) : ''}
                  onChange={(e) => setField('costPrice', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  validation={{ min: 0, max: 9999.99 }}
                  inputClassName="text-sm"
                  inputMode="decimal"
                />
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
                   error={errors.stockMin}
                   inputMode="numeric"
                 />
              </div>
            </div>

            <div className="space-y-3">
              {presentations.map((pres, index) => (
                <div
                  key={index}
                  className="border border-border rounded-xl p-4 space-y-3 bg-white hover:border-primary/20 hover:scale-[1.01] hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Variante #{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removePresentation(index)}
                      className="min-w-11 min-h-11 p-2.5 rounded-lg hover:bg-danger/10 text-gray-400 hover:text-danger transition-colors flex items-center justify-center"
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
                        value={pres.priceUsd > 0 ? String(pres.priceUsd) : ''}
                        onChange={(e) => updatePresentation(index, 'priceUsd', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        validation={{ min: 0.01 }}
                        inputClassName="text-sm"
                        inputMode="decimal"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Equivale a (unidades)</label>
                      <Input
                        sanitize="number"
                        decimals={0}
                        placeholder="12"
                        value={pres.unitMultiplier != null && pres.unitMultiplier >= 1 ? pres.unitMultiplier.toString() : ''}
                        onChange={(e) => updatePresentation(index, 'unitMultiplier', e.target.value === '' ? 1 : parseInt(e.target.value) || 1)}
                        validation={{ min: 1 }}
                        inputClassName="text-sm"
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">SKU</label>
                      <Input
                        placeholder="Ej: HP-001-A"
                        value={pres.barcode || ''}
                        onChange={(e) => updatePresentation(index, 'barcode', e.target.value || undefined)}
                        validation={{ maxLength: 50 }}
                        error={errors[`presentation_${index}_barcode`]}
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
              {errors.presentations && (
                <div ref={presentationsErrorRef}>
                  <p className="input-error-text mt-1">{errors.presentations}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <Settings size={14} className="text-gray-400 shrink-0" />
              <div className="flex-1 space-y-1">
                <Checkbox
                  label="Producto con IVA"
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="input-wrapper">
          <label className="input-label">
            Stock mínimo (alerta)
            {editProduct?.isWeighted && editProduct?.unit === 'kg' && ' (Kg)'}
            {editProduct?.isWeighted && editProduct?.unit === 'lt' && ' (Lt)'}
            {editProduct?.isWeighted && editProduct?.unit === 'm' && ' (m)'}
          </label>
          <Input
            sanitize="number"
            decimals={0}
            placeholder="0"
             value={formData.stockMin || ''}
             onChange={(e) => setField('stockMin', parseInt(e.target.value) || undefined)}
             validation={{ min: 0, max: 999 }}
             error={errors.stockMin}
             inputMode="numeric"
           />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Las variantes comparten el stock del producto base.
        </p>

        {presentations.map((pres, index) => (
          <div
            key={index}
            className="border border-border rounded-xl p-4 space-y-3 bg-white hover:border-primary/20 hover:scale-[1.01] hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Variante #{index + 1}</span>
              <button
                type="button"
                onClick={() => removePresentation(index)}
                className="min-w-11 min-h-11 p-2.5 rounded-lg hover:bg-danger/10 text-gray-400 hover:text-danger transition-colors flex items-center justify-center"
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
                  value={pres.priceUsd > 0 ? String(pres.priceUsd) : ''}
                  onChange={(e) => updatePresentation(index, 'priceUsd', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  validation={{ min: 0.01 }}
                  inputClassName="text-sm"
                  inputMode="decimal"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Multiplicador (unidades base) {!pres.id && <span className="text-gray-600">— nuevo</span>}
                  {pres.id && <span className="text-gray-600">— fijo</span>}
                </label>
                <Input
                  sanitize="number"
                  decimals={0}
                  disabled={!!pres.id}
                  placeholder="12"
                  value={pres.unitMultiplier?.toString() || ''}
                  onChange={(e) => updatePresentation(index, 'unitMultiplier', e.target.value === '' ? 1 : parseInt(e.target.value) || 1)}
                  validation={{ min: 1 }}
                  inputClassName={`text-sm ${pres.id ? 'opacity-60' : ''}`}
                  inputMode="numeric"
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
                  validation={{ maxLength: 50 }}
                  error={errors[`presentation_${index}_barcode`]}
                  inputClassName="text-sm"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPresentation}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-gray-300 text-gray-500 hover:border-primary/40 hover:text-primary transition-colors"
      >
        <Plus size={16} />
        Agregar variante
      </button>
      {errors.presentations && (
        <div ref={presentationsErrorRef}>
          <p className="input-error-text mt-1">{errors.presentations}</p>
        </div>
      )}

            {creationType !== 'weighted' && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Settings size={14} className="text-gray-400 shrink-0" />
                <div className="flex-1 space-y-1">
                  <Checkbox
                    label="Producto con IVA"
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
            )}
    </div>
  );

  const renderStepContent = () => {
    if (isEditing && presentationsLoading) {
      return (
        <div className="flex items-center justify-center py-12 animate-fade-in">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-500">Cargando variantes...</p>
          </div>
        </div>
      );
    }

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

      if (errors.presentations) {
        addToast({ type: 'warning', message: errors.presentations });
        setTimeout(() => {
          presentationsErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
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

    if (isEditing && presentationsLoading) {
      return (
        <div className="flex w-full">
          <Button variant="ghost" fullWidth disabled>
            Cargando...
          </Button>
        </div>
      );
    }

    return (
      <div className="flex gap-3 w-full">
        <Button variant="outline" className="flex-1" onClick={goBack}>
          <ChevronLeft size={16} />
          Atrás
        </Button>

        {isLastStep ? (
          <Button variant="primary" className="flex-1" onClick={handleFinalSubmit} loading={isSubmitting}>
            <Check size={16} />
            {isEditing ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        ) : (
          <Button variant="primary" className="flex-1" onClick={goNext}>
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
        {(!isEditing || !presentationsLoading) && (
          <StepIndicator current={currentStep} steps={steps} />
        )}
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

      <Modal isOpen={showImagePicker} onClose={() => setShowImagePicker(false)} title="Agregar imagen" size="sm">
        <div className="space-y-2">
          {cameraAvailable && (
            <button
              type="button"
              onClick={() => {
                setShowImagePicker(false);
                setTimeout(() => cameraInputRef.current?.click(), 100);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                <Camera size={18} className="text-primary" />
              </div>
              <div>
                <span className="block text-sm font-semibold text-gray-800">Tomar foto</span>
                <span className="block text-xs text-gray-500">Usa la cámara del dispositivo</span>
              </div>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowImagePicker(false);
              setTimeout(() => galleryInputRef.current?.click(), 100);
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
              <Image size={18} className="text-primary" />
            </div>
            <div>
              <span className="block text-sm font-semibold text-gray-800">Elegir de galería</span>
              <span className="block text-xs text-gray-500">Selecciona una imagen guardada</span>
            </div>
          </button>
          {!cameraAvailable && (
            <p className="text-[11px] text-gray-600 text-center pt-1">No se detectó cámara. Selecciona una imagen de la galería.</p>
          )}
        </div>
      </Modal>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleImageChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleImageChange}
      />
    </Modal>
  );
}
