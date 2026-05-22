import { useState, useRef } from 'react';
import { Button, Input, Modal, Checkbox, Select, SearchableSelect } from '../../../common/components';
import { ImagePlus, X, Scan, Package, DollarSign, Layers, Settings } from 'lucide-react';
import { useProductForm } from '../hooks/useProductForm';
import { BarcodeScannerModal } from '../../shared/components/BarcodeScannerModal';
import type { Category, CreateProductInput, Product } from '../types';

interface ProductFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProductInput & { stockInicial: number }, imageFile?: File | null) => Promise<boolean>;
  categories: Category[];
  editProduct?: Product | null;
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

export function ProductForm({ isOpen, onClose, onSubmit, categories, editProduct }: ProductFormProps) {
  const isEditing = !!editProduct;
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(editProduct?.imageUrl ?? null);
  const blobUrlRef = useRef<string | null>(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const initialValues = editProduct ? {
    name: editProduct.name,
    sku: editProduct.sku,
    priceUsd: editProduct.priceUsd,
    categoryId: editProduct.categoryId,
    isWeighted: editProduct.isWeighted,
    unit: editProduct.unit,
    stockMin: editProduct.stockMin,
  } : undefined;

  const wrappedOnSubmit = async (data: CreateProductInput & { stockInicial: number }): Promise<boolean> => {
    const result = await onSubmit(data, imageFile);
    if (result && !imageFile) {
      setImageFile(null);
      setImagePreview(null);
    }
    return result;
  };

  const { formData, errors, isSubmitting, setField, handleSubmit: formSubmit, reset } = useProductForm({ onSubmit: wrappedOnSubmit, initialValues });

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
          <Button variant="primary" fullWidth onClick={formSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear producto'}
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
              validation={{ required: true, maxLength: 50 }}
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
                validation={{ required: true, maxLength: 50 }}
                inputClassName="text-sm"
              />
              <Button variant="outline" size="sm" onClick={() => setShowBarcodeScanner(true)} className="shrink-0 px-2" title="Escanear código de barras">
                <Scan size={16} />
              </Button>
            </div>
          </div>
          <div className="input-wrapper">
            <label className="input-label">Precio USD</label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="2.50"
              value={formData.priceUsd || ''}
              onChange={(e) => setField('priceUsd', parseFloat(e.target.value) || 0)}
              error={errors.priceUsd}
              validation={{ required: true, min: 0.01, max: 9999 }}
              inputClassName="text-sm"
            />
          </div>
        </div>

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
                type="number"
                step={formData.productType === 'unidad' ? '1' : '0.01'}
                min="0"
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
              type="number"
              min="0"
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
          />
          {errors.categoryId && <span className="input-error-text">{errors.categoryId}</span>}
        </div>

        {/* Section: Configuración */}
        <SectionDivider icon={<Settings size={14} className="text-primary" />} title="Configuración" />

        {Object.keys(errors).length > 0 && (
          <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger space-y-0.5">
            {Object.entries(errors).map(([key, msg]) => (
              <p key={key}><strong>{key}:</strong> {msg}</p>
            ))}
          </div>
        )}

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
