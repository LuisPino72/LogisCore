import { useState, useCallback } from 'react';
import type { CreateRecipeInput, IngredientAvailability } from '../types';
import { useInventoryStore } from '../../inventory/stores/inventoryStore';

interface RecipeLineInput {
  productId: string;
  productName?: string;
  quantity: number;
  unit: string;
}

interface RecipeFormState {
  name: string;
  productId: string;
  productName?: string;
  mode: 'batch' | 'assembly';
  yieldQuantity: number;
  yieldUnit: string;
  wastePct: number;
  notes: string;
  lines: RecipeLineInput[];
}

const INITIAL_STATE: RecipeFormState = {
  name: '',
  productId: '',
  mode: 'batch',
  yieldQuantity: 1,
  yieldUnit: 'unidad',
  wastePct: 0,
  notes: '',
  lines: [],
};

export function useRecipeForm() {
  const [form, setForm] = useState<RecipeFormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ingredientAvailability, setIngredientAvailability] = useState<IngredientAvailability[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  const { products } = useInventoryStore();

  const updateField = useCallback(<K extends keyof RecipeFormState>(field: K, value: RecipeFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const addLine = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { productId: '', quantity: 1, unit: 'unidad' }],
    }));
  }, []);

  const updateLine = useCallback((index: number, field: keyof RecipeLineInput, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) =>
        i === index ? { ...line, [field]: value } : line
      ),
    }));
  }, []);

  const removeLine = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
    setIngredientAvailability((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) newErrors.name = 'Nombre requerido';
    if (!form.productId) newErrors.productId = 'Selecciona un producto terminado';
    if (form.yieldQuantity <= 0) newErrors.yieldQuantity = 'El yield debe ser mayor a 0';
    if (!form.yieldUnit) newErrors.yieldUnit = 'Selecciona una unidad';
    if (form.wastePct < 0 || form.wastePct > 100) newErrors.wastePct = 'La merma debe ser entre 0 y 100%';
    if (form.lines.length === 0) newErrors.lines = 'Agrega al menos un ingrediente';

    form.lines.forEach((line, i) => {
      if (!line.productId) newErrors[`line_${i}_product`] = 'Selecciona un ingrediente';
      if (line.quantity <= 0) newErrors[`line_${i}_quantity`] = 'Cantidad debe ser mayor a 0';
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const getAvailableIngredients = useCallback(() => {
    return products.filter((p) =>
      !p.deletedAt && (p.productType === 'materia_prima' || p.productType === 'both')
    );
  }, [products]);

  const getAvailableProducts = useCallback(() => {
    return products.filter((p) =>
      !p.deletedAt && (p.productType === 'producto_terminado' || p.productType === 'both')
    );
  }, [products]);

  const reset = useCallback(() => {
    setForm(INITIAL_STATE);
    setErrors({});
    setIngredientAvailability([]);
  }, []);

  const toInput = useCallback((): CreateRecipeInput | null => {
    if (!validate()) return null;
    return {
      name: form.name.trim(),
      productId: form.productId,
      mode: form.mode,
      yieldQuantity: form.yieldQuantity,
      yieldUnit: form.yieldUnit,
      wastePct: form.wastePct,
      notes: form.notes || undefined,
      lines: form.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unit: line.unit,
      })),
    };
  }, [form, validate]);

  return {
    form,
    errors,
    ingredientAvailability,
    isCheckingAvailability,
    updateField,
    addLine,
    updateLine,
    removeLine,
    validate,
    getAvailableIngredients,
    getAvailableProducts,
    toInput,
    reset,
    setIngredientAvailability,
    setIsCheckingAvailability,
  };
}
