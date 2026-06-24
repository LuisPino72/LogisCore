import { useState, useCallback, useMemo } from 'react';
import type { CreateRecipeInput, IngredientAvailability } from '../types';
import { useInventoryStore } from '../../inventory/stores/inventoryStore';
import { validateCycles, computeRecipeCostFromLines } from '../services/productionService';
import { getDb } from '@/services/dexie/db';
import { useAuthStore } from '../../auth/stores/authStore';

interface RecipeLineInput {
  id?: string;
  productId: string;
  productName?: string;
  quantity: number;
  unit: string;
}

// PRODUCTION-003 [Paso-2]: constante para identificar "crear nuevo producto"
const NEW_PRODUCT_SENTINEL = '__NEW_PRODUCT__';

// Mapeo de compatibilidad: unidad base del ingrediente → unidades permitidas en receta
const UNIT_COMPATIBILITY: Record<string, string[]> = {
  kg: ['g', 'kg'],
  gr: ['g', 'kg'],
  lt: ['ml', 'lt'],
  m: ['m', 'cm'],
  unidad: ['unidad'],
};

// Límites máximos de cantidad por unidad de receta
const MAX_QUANTITY_PER_UNIT: Record<string, number> = {
  g: 1_000_000,
  kg: 1_000_000,
  ml: 1_000_000,
  lt: 1_000_000,
  m: 1_000_000,
  cm: 1_000_000,
  unidad: 10_000,
};

// Helper: obtener unidades compatibles para una unidad base de inventario
function getCompatibleUnits(baseUnit: string): string[] {
  return UNIT_COMPATIBILITY[baseUnit] ?? ['unidad'];
}

// Helper: verificar si una unidad de receta es compatible con la unidad base del ingrediente
function isUnitCompatible(recipeUnit: string, baseUnit: string): boolean {
  const compat = getCompatibleUnits(baseUnit);
  return compat.includes(recipeUnit);
}

// Helper: obtener límite máximo para una unidad de receta
function getMaxQuantityForUnit(recipeUnit: string): number {
  return MAX_QUANTITY_PER_UNIT[recipeUnit] ?? 99_999;
}

// Helper: obtener unidad de receta por defecto según unidad de inventario
function getDefaultRecipeUnit(inventoryUnit: string): string {
  const MAP: Record<string, string> = {
    kg: 'g',
    gr: 'g',
    lt: 'ml',
    m: 'm',
    unidad: 'unidad',
  };
  return MAP[inventoryUnit] ?? 'unidad';
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
  // PRODUCTION-003 [Paso-2]: campos para auto-creación de producto_terminado
  newProductName: string;
  newProductSku: string;
  /** Si es ingrediente intermedio, no necesita precio de venta ni aparece en POS */
  newProductIsIngredient: boolean;
  newProductPriceUsd: number;
  newProductCategoryId: string;
  newProductIsTaxable: boolean;
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
  newProductIsIngredient: false,
  newProductPriceUsd: 0,
  newProductCategoryId: '',
  newProductIsTaxable: false,
};

export function useRecipeForm() {
  const [form, setForm] = useState<RecipeFormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ingredientAvailability, setIngredientAvailability] = useState<IngredientAvailability[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const { products, categories } = useInventoryStore();

  const TOTAL_STEPS = 3;

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
      lines: prev.lines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, [field]: value };
        // Auto-fill unit when product changes
        if (field === 'productId' && value) {
          const product = products.find(p => p.id === value);
          if (product?.unit) {
            next.unit = getDefaultRecipeUnit(product.unit);
          }
        }
        return next;
      }),
    }));
  }, [products]);

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
    // Si es nuevo producto, validar campos
    if (isNewProduct) {
      if (!form.newProductName.trim()) newErrors.newProductName = 'Nombre del producto requerido';
      if (form.newProductName.length > 25) newErrors.newProductName = 'Máximo 25 caracteres';
      if (!form.newProductSku.trim()) newErrors.newProductSku = 'SKU del producto requerido';
      if (form.newProductSku.length > 18) newErrors.newProductSku = 'Máximo 18 caracteres';
      if (!form.newProductIsIngredient && (!form.newProductPriceUsd || form.newProductPriceUsd <= 0)) {
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

  // Wizard step validation — validates only the current step's fields
  // isEdit changes the step mapping: edit step 1 = name + ingredients, edit step 2 = waste
  const validateStep = useCallback(async (step: number, isEdit = false): Promise<boolean> => {
    const stepErrors: Record<string, string> = {};

    if (isEdit) {
      // EDIT MODE: step 1 = name + ingredients, step 2 = waste/notes
      if (step === 1) {
        if (!form.name.trim()) stepErrors.name = 'Nombre requerido';
        if (form.name.trim().length > 25) stepErrors.name = 'Máximo 25 caracteres';

        // Also validate ingredients in step 1 (combined)
        if (form.lines.length === 0) stepErrors.lines = 'Agrega al menos un ingrediente';

        const ingredientIds = form.lines.map((l) => l.productId).filter(Boolean);
        const uniqueIds = new Set(ingredientIds);
        if (ingredientIds.length !== uniqueIds.size) {
          stepErrors.lines = 'No puede haber ingredientes duplicados';
        }

        const realProductId = form.productId === NEW_PRODUCT_SENTINEL || form.productId === '' ? '' : form.productId;
        if (realProductId && form.lines.length > 0) {
          const cycleCheck = await validateCycles(
            realProductId,
            form.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unit: l.unit })),
          );
          if (!cycleCheck.ok) {
            stepErrors.lines = cycleCheck.error.message;
          }
        }

        const db = getDb();
        for (let i = 0; i < form.lines.length; i++) {
          const line = form.lines[i];
          if (!line.productId) {
            stepErrors[`line_${i}_product`] = 'Selecciona un ingrediente';
            continue;
          }

          const session = useAuthStore.getState().session;
          const ingredient = await db.products.where({ id: line.productId, tenantId: session?.tenantId }).first();
          if (!ingredient || ingredient.deletedAt) {
            stepErrors[`line_${i}_product`] = 'Ingrediente no encontrado';
            continue;
          }

          // Validar sub-receta activa
          if (ingredient.productType === 'producto_terminado') {
            const subRecipe = await db.recipes
              .where('productId')
              .equals(ingredient.id)
              .filter((r) => !r.deletedAt && r.isActive)
              .first();
            if (!subRecipe) {
              stepErrors[`line_${i}_product`] = 'Este producto terminado no tiene receta activa';
            }
          }

          // Validar compatibilidad de unidades
          if (line.unit && ingredient.unit) {
            if (!isUnitCompatible(line.unit, ingredient.unit)) {
              const compat = getCompatibleUnits(ingredient.unit).join(', ');
              stepErrors[`line_${i}_unit`] = `Unidad incompatible. Para ${ingredient.unit} use: ${compat}`;
            }
          }

          // Validar límites de cantidad por unidad
          if (line.quantity > 0) {
            const maxQty = getMaxQuantityForUnit(line.unit);
            if (line.quantity > maxQty) {
              stepErrors[`line_${i}_quantity`] = `Cantidad máxima para ${line.unit}: ${maxQty.toLocaleString()}`;
            }
          }

          // Validar cantidad > 0
          if (line.quantity <= 0) {
            stepErrors[`line_${i}_quantity`] = 'Cantidad debe ser mayor a 0';
          }
        }
      }

      if (step === 2) {
        if (form.wastePct < 0 || form.wastePct > 100) stepErrors.wastePct = 'La merma debe ser entre 0 y 100%';
      }
    } else {
      // CREATE MODE: step 1 = info, step 2 = ingredients, step 3 = config
      if (step === 1) {
        if (!form.name.trim()) stepErrors.name = 'Nombre requerido';
        if (form.name.trim().length > 25) stepErrors.name = 'Máximo 25 caracteres';

        // Siempre se crea producto nuevo desde la receta - validar campos obligatorios
        if (!form.newProductName.trim()) stepErrors.newProductName = 'Nombre del producto requerido';
        if (form.newProductName.length > 25) stepErrors.newProductName = 'Máximo 25 caracteres';
        if (!form.newProductSku.trim()) stepErrors.newProductSku = 'SKU del producto requerido';
        if (form.newProductSku.length > 18) stepErrors.newProductSku = 'Máximo 18 caracteres';
        if (!form.newProductIsIngredient && (!form.newProductPriceUsd || form.newProductPriceUsd <= 0)) {
          stepErrors.newProductPriceUsd = 'Precio debe ser mayor a 0';
        }

        // Validaciones async: SKU único y nombre de receta único
        const db = getDb();
        if (form.newProductSku.trim()) {
          const existingSku = await db.products.where('sku').equals(form.newProductSku.trim().toUpperCase()).first();
          if (existingSku) {
            stepErrors.newProductSku = 'Este SKU ya existe';
          }
        }
        if (form.name.trim()) {
          const session = useAuthStore.getState().session;
          const existingRecipe = await db.recipes
            .where({ tenantId: session?.tenantId })
            .filter((r) => !r.deletedAt && r.name.toLowerCase() === form.name.trim().toLowerCase())
            .first();
          if (existingRecipe) {
            stepErrors.name = 'Ya existe una receta con este nombre';
          }
        }
      }

      if (step === 2) {
        if (form.lines.length === 0) stepErrors.lines = 'Agrega al menos un ingrediente';

        const ingredientIds = form.lines.map((l) => l.productId).filter(Boolean);
        const uniqueIds = new Set(ingredientIds);
        if (ingredientIds.length !== uniqueIds.size) {
          stepErrors.lines = 'No puede haber ingredientes duplicados';
        }

        const realProductId = form.productId === NEW_PRODUCT_SENTINEL || form.productId === '' ? '' : form.productId;
        if (realProductId && form.lines.length > 0) {
          const cycleCheck = await validateCycles(
            realProductId,
            form.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unit: l.unit })),
          );
          if (!cycleCheck.ok) {
            stepErrors.lines = cycleCheck.error.message;
          }
        }

        const db = getDb();
        for (let i = 0; i < form.lines.length; i++) {
          const line = form.lines[i];
          if (!line.productId) {
            stepErrors[`line_${i}_product`] = 'Selecciona un ingrediente';
            continue;
          }

          const session = useAuthStore.getState().session;
          const ingredient = await db.products.where({ id: line.productId, tenantId: session?.tenantId }).first();
          if (!ingredient || ingredient.deletedAt) {
            stepErrors[`line_${i}_product`] = 'Ingrediente no encontrado';
            continue;
          }

          // Validar sub-receta activa
          if (ingredient.productType === 'producto_terminado') {
            const subRecipe = await db.recipes
              .where('productId')
              .equals(ingredient.id)
              .filter((r) => !r.deletedAt && r.isActive)
              .first();
            if (!subRecipe) {
              stepErrors[`line_${i}_product`] = 'Este producto terminado no tiene receta activa';
            }
          }

          // Validar compatibilidad de unidades
          if (line.unit && ingredient.unit) {
            if (!isUnitCompatible(line.unit, ingredient.unit)) {
              const compat = getCompatibleUnits(ingredient.unit).join(', ');
              stepErrors[`line_${i}_unit`] = `Unidad incompatible. Para ${ingredient.unit} use: ${compat}`;
            }
          }

          // Validar límites de cantidad por unidad
          if (line.quantity > 0) {
            const maxQty = getMaxQuantityForUnit(line.unit);
            if (line.quantity > maxQty) {
              stepErrors[`line_${i}_quantity`] = `Cantidad máxima para ${line.unit}: ${maxQty.toLocaleString()}`;
            }
          }

          // Validar cantidad > 0
          if (line.quantity <= 0) {
            stepErrors[`line_${i}_quantity`] = 'Cantidad debe ser mayor a 0';
          }

          // Warning: stock insuficiente (solo materia_prima y both, no producto_terminado ni assembly)
          // producto_terminado se produce bajo demanda (sub-receta o batch)
          // assembly es modo de receta, no tipo de producto
          const isSubRecipe = ingredient.productType === 'producto_terminado';
          if (!isSubRecipe && ingredient.stock !== undefined) {
            const wasteMultiplier = 1 + (form.wastePct / 100);
            const needed = Math.ceil(line.quantity * wasteMultiplier);
            if (ingredient.stock < needed) {
              // Warning no bloqueante - se muestra en warnings useMemo
            }
          }
        }
      }

      if (step === 3) {
        if (form.yieldQuantity <= 0) stepErrors.yieldQuantity = 'La cantidad producida debe ser mayor a 0';
        if (!form.yieldUnit) stepErrors.yieldUnit = 'Selecciona una unidad';
        if (form.wastePct < 0 || form.wastePct > 100) stepErrors.wastePct = 'La merma debe ser entre 0 y 100%';

        // Validar compatibilidad yieldUnit con el tipo de producto nuevo
        if (form.yieldUnit && form.newProductName.trim()) {
          // Determinar el tipo de producto basado en yieldUnit
          // const isWeighted = form.yieldUnit === 'kg' || form.yieldUnit === 'g' || form.yieldUnit === 'lt' || form.yieldUnit === 'ml';
          // No hay validación estricta aquí, solo warning en el UI
        }
      }
    }

    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  }, [form]);

  const nextStep = useCallback(async (isEdit = false) => {
    const maxSteps = isEdit ? 2 : TOTAL_STEPS;
    if (currentStep < maxSteps) {
      const valid = await validateStep(currentStep, isEdit);
      if (valid) {
        setErrors({});
        setCurrentStep((s) => s + 1);
      }
    }
  }, [currentStep, validateStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 1) {
      setErrors({});
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback(async (step: number, isEdit = false) => {
    const maxSteps = isEdit ? 2 : TOTAL_STEPS;
    if (step < 1 || step > maxSteps) return;
    if (step < currentStep) {
      setErrors({});
      setCurrentStep(step);
    } else if (step > currentStep) {
      for (let s = currentStep; s < step; s++) {
        const valid = await validateStep(s, isEdit);
        if (!valid) return;
      }
      setErrors({});
      setCurrentStep(step);
    }
  }, [currentStep, validateStep]);

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
        // Warning: stock insuficiente (solo materia_prima y both, no producto_terminado ni assembly)
        if (ingredient && ingredient.stock !== undefined) {
          const isSubRecipe = ingredient.productType === 'producto_terminado';
          if (!isSubRecipe) {
            const wasteMultiplier = 1 + (form.wastePct / 100);
            const needed = Math.ceil(line.quantity * wasteMultiplier);
            if (ingredient.stock < needed) {
              w.push({ field: `line_${i}_stock`, message: `Stock bajo de "${ingredient.name}": ${ingredient.stock} disponible, se necesitan ${needed} (con merma ${form.wastePct}%)`, type: 'warning' });
            }
          }
        }
      }
    });

    return w;
  }, [form.productId, form.mode, form.yieldQuantity, form.lines, products, form.wastePct]);

  const estimatedCost = useMemo(() => {
    const yieldQty = form.mode === 'batch' ? form.yieldQuantity : 1;
    const productMap = new Map(products.map(p => [p.id, { costPrice: p.costPrice ?? 0, isWeighted: p.isWeighted, unit: p.unit }]));
    return computeRecipeCostFromLines(form.lines, productMap, form.wastePct, yieldQty);
  }, [form.lines, form.wastePct, form.yieldQuantity, form.mode, products]);

  const getAvailableIngredients = useCallback(() => {
    return products.filter((p) =>
      !p.deletedAt && (p.productType === 'materia_prima' || p.productType === 'producto_terminado' || p.productType === 'both')
    );
  }, [products]);

  const getAvailableProducts = useCallback(() => {
    return products.filter((p) =>
      !p.deletedAt && (p.productType === 'producto_terminado' || p.productType === 'resale' || p.productType === 'both')
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
    setCurrentStep(1);
  }, []);

  const getUnitOptions = useCallback((productId: string) => {
    const compat: Record<string, string[]> = {
      kg: ['g', 'kg'],
      gr: ['g', 'kg'],
      lt: ['ml', 'lt'],
      m: ['m'],
      unidad: ['unidad'],
    };
    const labels: Record<string, string> = {
      g: 'Gramos', kg: 'Kilogramos', ml: 'Mililitros', lt: 'Litros',
      m: 'Metros', unidad: 'Unidad',
    };
    if (!productId) {
      return [
        { value: 'g', label: 'Gramos' },
        { value: 'ml', label: 'Mililitros' },
        { value: 'unidad', label: 'Unidad' },
      ];
    }
    const product = products.find(p => p.id === productId);
    if (!product) {
      return [
        { value: 'g', label: 'Gramos' },
        { value: 'ml', label: 'Mililitros' },
        { value: 'unidad', label: 'Unidad' },
      ];
    }
    const units = compat[product.unit] ?? ['unidad'];
    return units.map(u => ({ value: u, label: labels[u] || u }));
  }, [products]);

  const toInput = useCallback(async (): Promise<CreateRecipeInput | null> => {
    if (!(await validate())) return null;
    // Siempre se crea producto nuevo desde la receta
    const input: CreateRecipeInput = {
      name: form.name.trim(),
      mode: form.mode,
      yieldQuantity: form.yieldQuantity,
      yieldUnit: form.yieldUnit,
      wastePct: form.wastePct,
      notes: form.notes || undefined,
      lines: form.lines.map((line) => ({
        ...(line.id ? { id: line.id } : {}),
        productId: line.productId,
        quantity: line.quantity,
        unit: line.unit,
      })),
      newProductName: form.newProductName.trim(),
      newProductSku: form.newProductSku.trim(),
      newProductIsIngredient: form.newProductIsIngredient,
      newProductPriceUsd: form.newProductIsIngredient ? undefined : form.newProductPriceUsd,
      newProductCategoryId: form.newProductCategoryId || undefined,
      newProductIsTaxable: form.newProductIsTaxable,
    };
    return input;
  }, [form, validate]);

  return {
    form,
    errors,
    warnings,
    estimatedCost,
    ingredientAvailability,
    isCheckingAvailability,
    currentStep,
    totalSteps: TOTAL_STEPS,
    updateField,
    addLine,
    updateLine,
    removeLine,
    validate,
    validateStep,
    nextStep,
    prevStep,
    goToStep,
    getAvailableIngredients,
    getAvailableProducts,
    getExpandPreview,
    toInput,
    reset,
    getUnitOptions,
    setIngredientAvailability,
    setIsCheckingAvailability,
    categories,
  };
}

// PRODUCTION-003 [Paso-2]: exportar sentinel para uso en componentes
export { NEW_PRODUCT_SENTINEL };
