import { useState, useCallback, useEffect } from 'react';
import { CreateProductInputSchema, CreatePresentationInputSchema } from '../../../specs/inventory';
import type { ProductFormData, CreateProductInput, CreatePresentationInput } from '../types';
import { useInventoryStore } from '../stores/inventoryStore';
import { inventoryService } from '../services/inventoryService';

type PresentationFormData = CreatePresentationInput & { id?: string };

// Utility for auto-generating SKU
const generateAutoSku = (name: string, existingSkus: string[]) => {
  const base = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  let counter = 1;
  while (true) {
    const sku = `${base}-${String(counter).padStart(3, '0')}`;
    if (!existingSkus.map(s => s.toLowerCase()).includes(sku.toLowerCase())) {
      return sku;
    }
    counter++;
  }
};

interface UseProductFormOptions {
  initialValues?: Partial<ProductFormData>;
  editProductId?: string;
  creationType?: 'simple' | 'weighted' | 'variants' | 'raw_material' | null;
  onSubmit: (data: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared' }) => Promise<boolean>;
}

interface UseProductFormReturn {
  formData: ProductFormData;
  errors: Record<string, string>;
  isSubmitting: boolean;
  setField: <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => void;
  setFormErrors: (errors: Record<string, string>) => void;
  handleSubmit: () => Promise<{ success: boolean; errors?: Record<string, string> }>;
  reset: () => void;
  presentations: PresentationFormData[];
  presentationsLoading: boolean;
  addPresentation: () => void;
  removePresentation: (index: number) => void;
  updatePresentation: (index: number, field: keyof CreatePresentationInput, value: unknown) => void;
  generateSku: () => void;
}

const defaultFormData: ProductFormData = {
  name: '',
  sku: '',
  priceUsd: 0,
  categoryId: undefined,
  isWeighted: false,
  isTaxable: true,
  isSellable: true,
  isRawMaterial: false,
  productionType: undefined,
  productType: 'unidad',
  unit: 'unidad',
  stockInicial: 0,
  stockMin: undefined,
  costPrice: 0,
};

export function useProductForm(options: UseProductFormOptions): UseProductFormReturn {
  const [formData, setFormData] = useState<ProductFormData>(() => {
    const base = { ...defaultFormData, ...options.initialValues };
    if (options.initialValues?.isRawMaterial) {
      return { ...base, productType: 'raw_material', isRawMaterial: true, productionType: 'materia_prima' };
    }
    return {
      ...base,
      productType: options.initialValues?.isWeighted
        ? options.initialValues?.unit === 'lt' ? 'pesable_lt' : 'pesable_kg'
        : 'unidad',
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [presentations, setPresentations] = useState<PresentationFormData[]>([]);
  const [presentationsLoading, setPresentationsLoading] = useState(!!options.editProductId);

  const setField = useCallback(<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => {
    if (options.editProductId && key === 'productType') return;
    if (options.editProductId && (key === 'isRawMaterial' || key === 'productionType')) return;
    setFormData((prev) => {
      const next = { ...prev, [key]: value };

      if (key === 'productType') {
        next.isWeighted = value === 'pesable_kg' || value === 'pesable_lt';
        next.unit = value === 'pesable_kg' ? 'kg' : value === 'pesable_lt' ? 'lt' : 'unidad';
      }

      // Materia prima: auto-set isSellable e isTaxable a false
      if (key === 'productType' && value === 'raw_material') {
        next.isSellable = false;
        next.isTaxable = false;
        next.isWeighted = false;
        next.unit = 'unidad';
      }

      if (key === 'isRawMaterial') {
        if (value === true) {
          next.isSellable = false;
        } else {
          next.productionType = undefined;
        }
      }
      // DINERO-005 (C5) handled inline above.

      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }, [options.editProductId]);

  const setFormErrors = useCallback((newErrors: Record<string, string>) => {
    setErrors((prev) => ({ ...prev, ...newErrors }));
  }, []);

  const generateSku = useCallback(() => {
    if (!formData.name.trim()) return;
    const existing = useInventoryStore.getState().products
      .map((p) => p.sku)
      .filter((sku): sku is string => typeof sku === 'string' && sku.length > 0);
    const newSku = generateAutoSku(formData.name, existing);
    setField('sku', newSku);
  }, [formData.name, setField]);

  const addPresentation = useCallback(() => {
    setPresentations(prev => [...prev, {
      name: '',
      priceUsd: 0,
      unitMultiplier: 1,
      stockType: 'shared',
      sortOrder: 0,
      barcode: undefined,
      stockInicial: 0,
    }]);
  }, []);

  const removePresentation = useCallback((index: number) => {
    setPresentations(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updatePresentation = useCallback((index: number, field: keyof CreatePresentationInput, value: unknown) => {
    setPresentations(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }, []);

  useEffect(() => {
    if (options.editProductId) {
      setPresentationsLoading(true);
      const load = async () => {
        try {
          const result = await inventoryService.getPresentationsForProduct(options.editProductId!);
          if (result.ok && result.data.length > 0) {
            const mapped = result.data.map(p => ({
              id: p.id,
              name: p.name,
              priceUsd: p.priceUsd,
              unitMultiplier: p.unitMultiplier,
              stockType: 'shared' as const,
              sortOrder: p.sortOrder ?? 0,
              barcode: p.barcode || undefined,
              stockInicial: 0,
            }));
            setPresentations(mapped);
          }
        } finally {
          setPresentationsLoading(false);
        }
      };
      load();
    } else {
      setPresentationsLoading(false);
    }
  }, [options.editProductId]);

  const reset = useCallback(() => {
    setFormData(defaultFormData);
    setErrors({});
    setIsSubmitting(false);
    setPresentations([]);
    setPresentationsLoading(false);
  }, []);

  const handleSubmit = useCallback(async (): Promise<{ success: boolean; errors?: Record<string, string> }> => {
    setErrors({});
    setIsSubmitting(true);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { productType, stockInicial, ...validationData } = formData;

    if (!validationData.categoryId) {
      const errs = { categoryId: 'Debes seleccionar una categoría' };
      setErrors(errs);
      setIsSubmitting(false);
      return { success: false, errors: errs };
    }

    if (formData.isRawMaterial && !formData.productionType) {
      const errs = { productionType: 'Selecciona el rol de producción' };
      setErrors(errs);
      setIsSubmitting(false);
      return { success: false, errors: errs };
    }

    // Si tiene variantes, el precio base se hereda de la primera variante para pasar Zod
    if (presentations.length > 0 && validationData.priceUsd <= 0) {
      validationData.priceUsd = presentations[0]?.priceUsd || 0.05;
    }

    // Materia prima no tiene precio de venta, pero Zod exige > 0
    if (options.creationType === 'raw_material' && validationData.priceUsd <= 0) {
      validationData.priceUsd = 0.01;
    }

    const parsed = CreateProductInputSchema.safeParse(validationData);

    if (!parsed.success) {
      console.error('[ProductForm Validation Error]:', parsed.error.format());
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      setIsSubmitting(false);
      return { success: false, errors: fieldErrors };
    }

    if (validationData.priceUsd > 0 && validationData.priceUsd < 0.05) {
      const errs = { priceUsd: 'El precio parece muy bajo. ¿Estás seguro?' };
      setErrors(errs);
      setIsSubmitting(false);
      return { success: false, errors: errs };
    }

    const isEditing = options.initialValues !== undefined;
    if (!isEditing) {
      if (formData.stockInicial < 0) {
        const errs = { stockInicial: 'El stock inicial no puede ser negativo' };
        setErrors(errs);
        setIsSubmitting(false);
        return { success: false, errors: errs };
      }
      if (formData.productType === 'unidad' && !Number.isInteger(formData.stockInicial)) {
        const errs = { stockInicial: 'Los productos por unidad deben tener stock entero' };
        setErrors(errs);
        setIsSubmitting(false);
        return { success: false, errors: errs };
      }
    }

    // Validación: materia prima requiere costo
    if (options.creationType === 'raw_material' && (!formData.costPrice || formData.costPrice <= 0)) {
      const errs = { costPrice: 'El costo total de la compra es requerido para materia prima.' };
      setErrors(errs);
      setIsSubmitting(false);
      return { success: false, errors: errs };
    }

    // Validación: materia prima requiere stock inicial
    if (options.creationType === 'raw_material' && (!formData.stockInicial || formData.stockInicial <= 0)) {
      const errs = { stockInicial: 'El stock inicial es requerido para materia prima. Ingresa la cantidad inicial.' };
      setErrors(errs);
      setIsSubmitting(false);
      return { success: false, errors: errs };
    }

    const trimmedSku = formData.sku.trim();
    if (trimmedSku) {
      const existingProducts = useInventoryStore.getState().products;
      const skuExists = existingProducts.some(
        (p) => p.sku && p.sku.toLowerCase() === trimmedSku.toLowerCase() && (!options.editProductId || p.id !== options.editProductId)
      );
      if (skuExists) {
        const errs = { sku: 'Ya existe un producto con este código SKU' };
        setErrors(errs);
        setIsSubmitting(false);
        return { success: false, errors: errs };
      }
    }

    if (presentations.length === 0 && options.creationType === 'variants') {
      const errs = { presentations: 'Debes agregar al menos una variante' };
      setErrors(errs);
      setIsSubmitting(false);
      return { success: false, errors: errs };
    }

    if (presentations.length > 0) {
      const names = presentations.map((p) => p.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) {
        const errs = { presentations: 'No puede haber dos presentaciones con el mismo nombre.' };
        setErrors(errs);
        setIsSubmitting(false);
        return { success: false, errors: errs };
      }

      const barcodes = presentations.map((p) => p.barcode?.trim().toLowerCase()).filter(Boolean);
      if (new Set(barcodes).size !== barcodes.length) {
        const errs = { presentations: 'No puede haber dos presentaciones con el mismo código de barras.' };
        setErrors(errs);
        setIsSubmitting(false);
        return { success: false, errors: errs };
      }

      for (let i = 0; i < presentations.length; i++) {
        const pres = presentations[i];
        if (!pres.name.trim()) {
          const errs = { presentations: `Variante #${i + 1}: el nombre es obligatorio.` };
          setErrors(errs);
          setIsSubmitting(false);
          return { success: false, errors: errs };
        }
        if (pres.priceUsd <= 0) {
          const errs = { presentations: `Variante #${i + 1}: el precio debe ser mayor a 0.` };
          setErrors(errs);
          setIsSubmitting(false);
          return { success: false, errors: errs };
        }
        if (!pres.unitMultiplier || pres.unitMultiplier <= 0) {
          const errs = { presentations: `Variante #${i + 1}: el multiplicador debe ser mayor a 0.` };
          setErrors(errs);
          setIsSubmitting(false);
          return { success: false, errors: errs };
        }
        const presParsed = CreatePresentationInputSchema.safeParse(pres);
        if (!presParsed.success) {
          const firstIssue = presParsed.error.issues[0];
          const errs = { presentations: `Variante #${i + 1}: ${firstIssue.message}` };
          setErrors(errs);
          setIsSubmitting(false);
          return { success: false, errors: errs };
        }
      }
    }

    const submitData: CreateProductInput & { stockInicial: number; presentations?: CreatePresentationInput[]; stockType?: 'shared'; productType?: 'resale' | 'materia_prima' } = {
      ...parsed.data,
      stockInicial: isEditing ? 0 : formData.stockInicial,
      // Mapear raw_material a materia_prima para la BD
      productType: options.creationType === 'raw_material' ? 'materia_prima' : 
                   formData.isRawMaterial ? 'materia_prima' : 'resale',
      // Materia prima no es vendible ni taxable
      isSellable: options.creationType === 'raw_material' ? false : parsed.data.isSellable,
      isTaxable: options.creationType === 'raw_material' ? false : parsed.data.isTaxable,
    };

    if (presentations.length > 0) {
      submitData.presentations = presentations;
      submitData.stockType = 'shared';
    }

    const success = await options.onSubmit(submitData);

    setIsSubmitting(false);
    if (success) reset();
    return { success };
  }, [formData, options, presentations]);

  return {
    formData,
    errors,
    isSubmitting,
    setField,
    setFormErrors,
    handleSubmit,
    reset,
    presentations,
    presentationsLoading,
    addPresentation,
    removePresentation,
    updatePresentation,
    generateSku,
  };
}
