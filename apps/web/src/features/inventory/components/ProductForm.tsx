import { Button, Input, Modal } from '../../../common/components';
import { useProductForm } from '../hooks/useProductForm';
import type { Category, CreateProductInput, Product } from '../types';

interface ProductFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProductInput & { stockInicial: number }) => Promise<boolean>;
  categories: Category[];
  editProduct?: Product | null;
}

export function ProductForm({ isOpen, onClose, onSubmit, categories, editProduct }: ProductFormProps) {
  const isEditing = !!editProduct;
  const initialValues = editProduct ? {
    name: editProduct.name,
    sku: editProduct.sku,
    priceUsd: editProduct.priceUsd,
    categoryId: editProduct.categoryId,
    isWeighted: editProduct.isWeighted,
    unit: editProduct.unit,
    stockMin: editProduct.stockMin,
  } : undefined;

  const { formData, errors, isSubmitting, setField, handleSubmit, reset } = useProductForm({ onSubmit, initialValues });

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEditing ? 'Editar producto' : 'Nuevo producto'}>
      <div className="space-y-4">
        <div className="input-wrapper">
          <label className="input-label">Nombre del producto</label>
          <Input
            placeholder="Ej: Harina PAN"
            value={formData.name}
            onChange={(e) => setField('name', e.target.value)}
            error={errors.name}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="input-wrapper">
            <label className="input-label">SKU</label>
            <Input
              placeholder="Ej: HP-001"
              value={formData.sku}
              onChange={(e) => setField('sku', e.target.value)}
              error={errors.sku}
            />
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
            />
          </div>
        </div>

        <div className="input-wrapper">
          <label className="input-label">Tipo de producto</label>
          <select
            className="select"
            value={formData.productType}
            onChange={(e) => setField('productType', e.target.value as 'unidad' | 'pesable_kg' | 'pesable_lt')}
          >
            <option value="unidad">Unidad (entero)</option>
            <option value="pesable_kg">Pesable (Kg)</option>
            <option value="pesable_lt">Líquido (Lt)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
          <label className="input-label">Categoría</label>
          <select
            className="select"
            value={formData.categoryId || ''}
            onChange={(e) => setField('categoryId', e.target.value || undefined)}
          >
            <option value="">Seleccionar categoría...</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          {errors.categoryId && <span className="text-xs text-danger">{errors.categoryId}</span>}
        </div>

        {Object.keys(errors).length > 0 && (
          <div className="text-xs text-danger space-y-1">
            {Object.entries(errors).map(([key, msg]) => (
              <p key={key}>{msg}</p>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={handleClose}>
            Cancelar
          </Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
