import { useState, useCallback } from 'react';
import { CreateProductInputSchema } from '../../../specs/inventory';
import type { ProductFormData, CreateProductInput } from '../types';

interface UseProductFormOptions {
  initialValues?: Partial<ProductFormData>;
  onSubmit: (data: CreateProductInput & { stockInicial: number }) => Promise<boolean>;
}

interface UseProductFormReturn {
  formData: ProductFormData;
  errors: Record<string, string>;
  isSubmitting: boolean;
  setField: <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => void;
  handleSubmit: () => Promise<void>;
  reset: () => void;
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

  const reset = useCallback(() => {
    setFormData(defaultFormData);
    setErrors({});
    setIsSubmitting(false);
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

    const isEditing = options.initialValues !== undefined;
    const success = await options.onSubmit({
      ...parsed.data,
      stockInicial: isEditing ? 0 : formData.stockInicial,
    });

    setIsSubmitting(false);
    if (success) reset();
  }, [formData, options]);

  return { formData, errors, isSubmitting, setField, handleSubmit, reset };
}
