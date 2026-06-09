import { useState, useCallback, useMemo } from 'react';
import type { CreateRecipeInput, IngredientAvailability } from '../types';
import { useInventoryStore } from '../../inventory/stores/inventoryStore';
import { validateCycles } from '../services/productionService';

interface RecipeLineInput {
  productId: string;
  productName?: string;
  quantity: number;
  unit: string;
}

// PRODUCTION-003 [Paso-2]: constante para identificar "crear nuevo producto"
const NEW_PRODUCT_SENTINEL = '__NEW_PRODUCT__';

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
  // PRODUCTION-003 [Paso-2]: campos para auto-creación de producto_terminado
  newProductName: string;
  newProductSku: string;
  newProductPriceUsd: number;
  newProductCategoryId: string;
}

export interface FormWarning {
  field: string;
  message: string;
  type: 'warning' | 'info';
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
  newProductName: '',
  newProductSku: '',
  newProductPriceUsd: 0,
  newProductCategoryId: '',
};

export function useRecipeForm() {
  const [form, setForm] = useState<RecipeFormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ingredientAvailability, setIngredientAvailability] = useState<IngredientAvailability[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  const { products, categories } = useInventoryStore();

  const updateField = useCallback(<K extends keyof RecipeFormState>(field: K, value: RecipeFormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Force yield = 1 for assembly mode
      if (field === 'mode' && value === 'assembly') {
        next.yieldQuantity = 1;
        next.yieldUnit = 'unidad';
      }
      return next;
    });
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

  const validate = useCallback(async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) newErrors.name = 'Nombre requerido';
    if (form.name.trim().length > 25) newErrors.name = 'Máximo 25 caracteres';

    // PRODUCTION-003 [Paso-2]: productId puede ser vacío (auto-crear) o un UUID
    const isNewProduct = form.productId === NEW_PRODUCT_SENTINEL || form.productId === '';
    if (!isNewProduct && !form.productId) {
      newErrors.productId = 'Selecciona un producto terminado o crea uno nuevo';
    }
    // Si es nuevo producto, validar campos
    if (isNewProduct) {
      if (!form.newProductName.trim()) newErrors.newProductName = 'Nombre del producto requerido';
      if (form.newProductName.length > 25) newErrors.newProductName = 'Máximo 25 caracteres';
      if (!form.newProductSku.trim()) newErrors.newProductSku = 'SKU del producto requerido';
      if (form.newProductSku.length > 18) newErrors.newProductSku = 'Máximo 18 caracteres';
      if (!form.newProductPriceUsd || form.newProductPriceUsd <= 0) {
        newErrors.newProductPriceUsd = 'Precio debe ser mayor a 0';
      }
    }

    if (form.yieldQuantity <= 0) newErrors.yieldQuantity = 'La cantidad producida debe ser mayor a 0';
    if (!form.yieldUnit) newErrors.yieldUnit = 'Selecciona una unidad';
    if (form.wastePct < 0 || form.wastePct > 100) newErrors.wastePct = 'La merma debe ser entre 0 y 100%';
    if (form.lines.length === 0) newErrors.lines = 'Agrega al menos un ingrediente';

    // Check for duplicate ingredients
    const ingredientIds = form.lines.map((l) => l.productId).filter(Boolean);
    const uniqueIds = new Set(ingredientIds);
    if (ingredientIds.length !== uniqueIds.size) {
      newErrors.lines = 'No puede haber ingredientes duplicados';
    }

    // PRODUCTION-001-010: Validación completa de ciclos (incluye sub-recetas anidadas)
    // Solo si hay un productId real (no sentinel)
    const realProductId = isNewProduct ? '' : form.productId;
    if (realProductId && form.lines.length > 0) {
      const cycleCheck = await validateCycles(
        realProductId,
        form.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unit: l.unit })),
      );
      if (!cycleCheck.ok) {
        newErrors.lines = cycleCheck.error.message;
      }
    }

    form.lines.forEach((line, i) => {
      if (!line.productId) newErrors[`line_${i}_product`] = 'Selecciona un ingrediente';
      if (line.quantity <= 0) newErrors[`line_${i}_quantity`] = 'Cantidad debe ser mayor a 0';
      if (line.quantity > 99999) newErrors[`line_${i}_quantity`] = 'Cantidad máxima: 99,999';
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const warnings = useMemo((): FormWarning[] => {
    const w: FormWarning[] = [];
    const allProducts = products;

    // Product warnings
    if (form.productId) {
      const product = allProducts.find((p) => p.id === form.productId);
      if (product) {
        if (product.priceUsd <= 0) {
          w.push({ field: 'productId', message: 'Este producto no tiene precio de venta. No se podrá vender.', type: 'warning' });
        }
        if (product.isSellable === false) {
          w.push({ field: 'productId', message: 'Este producto no está marcado como vendible.', type: 'warning' });
        }
      }
    }

    // Assembly mode: yield must be 1
    if (form.mode === 'assembly' && form.yieldQuantity !== 1) {
      w.push({ field: 'yieldQuantity', message: 'En modo ensamblaje, la cantidad producida siempre es 1 unidad.', type: 'info' });
    }

    // PRODUCTION-003 [Paso-5] — Ingredient cost warnings (espejo del warning en calculateRecipeCost)
    form.lines.forEach((line, i) => {
      if (line.productId) {
        const ingredient = allProducts.find((p) => p.id === line.productId);
        if (ingredient && (!ingredient.costPrice || ingredient.costPrice <= 0)) {
          w.push({ field: `line_${i}_cost`, message: `"${ingredient.name}" no tiene costo registrado. El costo de producción será impreciso.`, type: 'warning' });
        }
      }
    });

    return w;
  }, [form.productId, form.mode, form.yieldQuantity, form.lines, products]);

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

  // PRODUCTION-001-011: Preview de líneas para distinguir sub-recetas
  const getExpandPreview = useCallback((lines: RecipeLineInput[]) => {
    return lines.map((line, index) => {
      const product = products.find((p) => p.id === line.productId);
      const isSubRecipe = product?.productType === 'producto_terminado';
      return {
        index,
        productId: line.productId,
        productName: product?.name ?? 'Sin nombre',
        quantity: line.quantity,
        unit: line.unit,
        isSubRecipe,
      };
    });
  }, [products]);

  const reset = useCallback(() => {
    setForm(INITIAL_STATE);
    setErrors({});
    setIngredientAvailability([]);
  }, []);

  const toInput = useCallback(async (): Promise<CreateRecipeInput | null> => {
    if (!(await validate())) return null;
    // PRODUCTION-003 [Paso-2]: si el usuario eligió "Crear nuevo producto", no enviar productId
    const isNewProduct = form.productId === NEW_PRODUCT_SENTINEL || form.productId === '';
    const input: CreateRecipeInput = {
      name: form.name.trim(),
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
    if (isNewProduct) {
      input.newProductName = form.newProductName.trim();
      input.newProductSku = form.newProductSku.trim();
      input.newProductPriceUsd = form.newProductPriceUsd;
      if (form.newProductCategoryId) input.newProductCategoryId = form.newProductCategoryId;
    } else {
      input.productId = form.productId;
    }
    return input;
  }, [form, validate]);

  return {
    form,
    errors,
    warnings,
    ingredientAvailability,
    isCheckingAvailability,
    updateField,
    addLine,
    updateLine,
    removeLine,
    validate,
    getAvailableIngredients,
    getAvailableProducts,
    getExpandPreview,
    toInput,
    reset,
    setIngredientAvailability,
    setIsCheckingAvailability,
    categories,
  };
}

// PRODUCTION-003 [Paso-2]: exportar sentinel para uso en componentes
export { NEW_PRODUCT_SENTINEL };
