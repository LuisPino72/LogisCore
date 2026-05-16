import { useState } from 'react';
import { Button, Input, Modal, Checkbox, Select } from '../../../common/components';
import { ImagePlus, X, Scan } from 'lucide-react';
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

export function ProductForm({ isOpen, onClose, onSubmit, categories, editProduct }: ProductFormProps) {
  const isEditing = !!editProduct;
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(editProduct?.imageUrl ?? null);
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
    if (result) {
      setImageFile(null);
      setImagePreview(null);
    }
    return result;
  };

  const { formData, errors, isSubmitting, setField, handleSubmit: formSubmit, reset } = useProductForm({ onSubmit: wrappedOnSubmit, initialValues });

  const handleClose = () => {
    reset();
    setImageFile(null);
    setImagePreview(null);
    onClose();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEditing ? 'Editar producto' : 'Nuevo producto'}>
      <div className="space-y-4">
        <div className="input-wrapper text-center">
          <label className="input-label text-center">Nombre del producto</label>
          <Input
            placeholder="Ej: Harina PAN"
            value={formData.name}
            onChange={(e) => setField('name', e.target.value)}
            error={errors.name}
            inputClassName="text-sm px-2 py-2"
          />
        </div>

        {/* Image upload */}
        <div className="input-wrapper">
          <label className="input-label">Foto del producto</label>
          <div className="flex items-center gap-3">
            {imagePreview ? (
              <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-0 right-0 w-5 h-5 bg-gray-900/60 text-white rounded-bl-lg flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-primary transition-colors shrink-0">
                <ImagePlus size={20} className="text-gray-400" />
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} />
              </label>
            )}
            <p className="text-[10px] text-gray-400">JPG, PNG o WebP. Máx 2MB.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="input-wrapper">
            <label className="input-label text-center">SKU</label>
            <div className="flex gap-1">
              <Input
                placeholder="Ej: HP-001"
                value={formData.sku}
                onChange={(e) => setField('sku', e.target.value)}
                error={errors.sku}
                inputClassName="text-sm px-2 py-2 flex-1"
              />
              <Button variant="ghost" size="sm" onClick={() => setShowBarcodeScanner(true)} className="p-2 shrink-0" title="Escanear código de barras">
                <Scan size={16} />
              </Button>
            </div>
          </div>
          <div className="input-wrapper">
            <label className="input-label text-center">Precio USD</label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="2.50"
              value={formData.priceUsd || ''}
              onChange={(e) => setField('priceUsd', parseFloat(e.target.value) || 0)}
              error={errors.priceUsd}
              inputClassName="text-sm px-2 py-2"
            />
          </div>
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
            />
          </div>
        </div>

        <div className="input-wrapper">
          <Select
            label="Categoría"
            value={formData.categoryId || ''}
            onChange={(e) => setField('categoryId', e.target.value || undefined)}
            error={errors.categoryId}
          >
            <option value="">Seleccionar categoría...</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </Select>
        </div>

          {Object.keys(errors).length > 0 && (
            <div className="text-xs text-danger space-y-1">
              {Object.entries(errors).map(([key, msg]) => (
                <p key={key}>{msg}</p>
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
              Desmarca esta casilla si el producto está exento de IVA (ej: alimentos de la cesta básica).
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

          <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={handleClose}>
            Cancelar
          </Button>
          <Button variant="primary" fullWidth onClick={formSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear producto'}
          </Button>
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
