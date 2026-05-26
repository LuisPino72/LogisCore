import { useState, useCallback, useEffect } from 'react';
import { CreateProductInputSchema, CreatePresentationInputSchema } from '../../../specs/inventory';
import type { ProductFormData, CreateProductInput, CreatePresentationInput } from '../types';
import { useInventoryStore } from '../stores/inventoryStore';

interface UseProductFormOptions {
  initialValues?: Partial<ProductFormData>;
  editProductId?: string;
  onSubmit: (data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' | 'independent' }) => Promise<boolean>;
}

interface UseProductFormReturn {
  formData: ProductFormData;
  errors: Record<string, string>;
  isSubmitting: boolean;
  setField: <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => void;
  handleSubmit: () => Promise<void>;
  reset: () => void;
  presentations: CreatePresentationInput[];
  addPresentation: () => void;
  removePresentation: (index: number) => void;
  updatePresentation: (index: number, field: keyof CreatePresentationInput, value: unknown) => void;
  setStockType: (type: 'shared' | 'independent') => void;
  stockType: 'shared' | 'independent';
}

const defaultFormData: ProductFormData = {
  name: '',
  sku: '',
  priceUsd: 0,
  categoryId: undefined,
  isWeighted: false,
  isTaxable: true,
  isSellable: true,
  productType: 'unidad',
  unit: 'unidad',
  stockInicial: 0,
  stockMin: undefined,
  costPrice: 0,
};

export function useProductForm(options: UseProductFormOptions): UseProductFormReturn {
  const [formData, setFormData] = useState<ProductFormData>({
    ...defaultFormData,
    ...options.initialValues,
    productType: options.initialValues?.isWeighted
      ? options.initialValues?.unit === 'lt' ? 'pesable_lt' : 'pesable_kg'
      : 'unidad',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [presentations, setPresentations] = useState<CreatePresentationInput[]>([]);
  const [stockType, setStockType] = useState<'shared' | 'independent'>('shared');

  const setField = useCallback(<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };

      if (key === 'productType') {
        next.isWeighted = value === 'pesable_kg' || value === 'pesable_lt';
        next.unit = value === 'pesable_kg' ? 'kg' : value === 'pesable_lt' ? 'lt' : 'unidad';
      }

      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }, []);

  const addPresentation = useCallback(() => {
    setPresentations(prev => [...prev, {
      name: '',
      priceUsd: 0,
      unitMultiplier: 1,
      stockType,
      sortOrder: 0,
      barcode: undefined,
    }]);
  }, [stockType]);

  const removePresentation = useCallback((index: number) => {
    setPresentations(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updatePresentation = useCallback((index: number, field: keyof CreatePresentationInput, value: unknown) => {
    setPresentations(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }, []);

  useEffect(() => {
    if (options.editProductId) {
      const load = async () => {
        const existing = await useInventoryStore.getState().fetchPresentations(options.editProductId!);
        if (existing.length > 0) {
          const mapped = existing.map(p => ({
            id: p.id,
            name: p.name,
            priceUsd: p.priceUsd,
            unitMultiplier: p.unitMultiplier,
            stockType: p.stockType,
            sortOrder: p.sortOrder ?? 0,
            barcode: p.barcode || undefined,
            stockInicial: 0,
          }));
          setPresentations(mapped);
          setStockType(existing[0].stockType);
        }
      };
      load();
    }
  }, [options.editProductId]);

  const reset = useCallback(() => {
    setFormData(defaultFormData);
    setErrors({});
    setIsSubmitting(false);
    setPresentations([]);
    setStockType('shared');
  }, []);

  const handleSubmit = useCallback(async () => {
    setErrors({});
    setIsSubmitting(true);

    const parsed = CreateProductInputSchema.safeParse({
      name: formData.name,
      sku: formData.sku,
      priceUsd: formData.priceUsd,
      categoryId: formData.categoryId,
      isWeighted: formData.isWeighted,
      isTaxable: formData.isTaxable,
      isSellable: formData.isSellable,
      unit: formData.unit,
      stockMin: formData.stockMin || undefined,
      costPrice: formData.costPrice || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      setIsSubmitting(false);
      return;
    }

    // Validar precio mínimo razonable
    if (formData.priceUsd > 0 && formData.priceUsd < 0.05) {
      setErrors({ priceUsd: 'El precio parece muy bajo. ¿Estás seguro?' });
      setIsSubmitting(false);
      return;
    }

    // Validar stock inicial
    const isEditing = options.initialValues !== undefined;
    if (!isEditing) {
      if (formData.stockInicial < 0) {
        setErrors({ stockInicial: 'El stock inicial no puede ser negativo' });
        setIsSubmitting(false);
        return;
      }
      if (formData.productType === 'unidad' && !Number.isInteger(formData.stockInicial)) {
        setErrors({ stockInicial: 'Los productos por unidad deben tener stock entero' });
        setIsSubmitting(false);
        return;
      }
    }

    // Validar SKU duplicado contra productos existentes
    if (formData.sku.trim()) {
      const existingProducts = useInventoryStore.getState().products;
      const skuExists = existingProducts.some(
        (p) => p.sku.toLowerCase() === formData.sku.trim().toLowerCase() && (!options.editProductId || p.id !== options.editProductId)
      );
      if (skuExists) {
        setErrors({ sku: 'Ya existe un producto con este código SKU' });
        setIsSubmitting(false);
        return;
      }
    }

    // Validar presentaciones con Zod
    if (presentations.length > 0) {
      const names = presentations.map((p) => p.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) {
        setErrors({ presentations: 'No puede haber dos presentaciones con el mismo nombre.' });
        setIsSubmitting(false);
        return;
      }

      for (let i = 0; i < presentations.length; i++) {
        const pres = presentations[i];
        const presParsed = CreatePresentationInputSchema.safeParse(pres);
        if (!presParsed.success) {
          const firstIssue = presParsed.error.issues[0];
          setErrors({ presentations: `Presentación #${i + 1}: ${firstIssue.message}` });
          setIsSubmitting(false);
          return;
        }
      }
    }

    const submitData: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' | 'independent' } = {
      ...parsed.data,
      stockInicial: isEditing ? 0 : formData.stockInicial,
    };

    if (presentations.length > 0) {
      submitData.presentations = presentations;
      submitData.stockType = stockType;
    }

    const success = await options.onSubmit(submitData);

    setIsSubmitting(false);
    if (success) reset();
  }, [formData, options, presentations, stockType]);

  return {
    formData,
    errors,
    isSubmitting,
    setField,
    handleSubmit,
    reset,
    presentations,
    addPresentation,
    removePresentation,
    updatePresentation,
    setStockType,
    stockType,
  };
}
