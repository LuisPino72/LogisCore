import { useState, useEffect } from 'react';
import { ChefHat, Plus, Trash2, AlertTriangle, Info, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { Button, Card, Modal, Input, SearchableSelect, Spinner } from '../../../common/components';
import { useRecipeForm, NEW_PRODUCT_SENTINEL } from '../hooks/useRecipeForm';
import { useProductionStore } from '../stores/productionStore';
import { useToastStore } from '../../../stores/toastStore';
import type { Recipe } from '../types';

interface RecipeFormProps {
  recipe: Recipe | null;
  tenantId: string | null;
  userId: string | undefined;
  onClose: () => void;
}

export function RecipeForm({ recipe, tenantId, userId, onClose }: RecipeFormProps) {
  const {
    form, errors, warnings,
    updateField, addLine, updateLine, removeLine,
    toInput,
    getAvailableIngredients, getAvailableProducts,
    getExpandPreview, categories,
  } = useRecipeForm();

  const { createRecipe, updateRecipe, getRecipeWithLines } = useProductionStore();
  const storeError = useProductionStore((s) => s.error);
  const { addToast } = useToastStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(!!recipe);
  const [showPreview, setShowPreview] = useState(false);

  // Load existing recipe data
  useEffect(() => {
    if (recipe) {
      getRecipeWithLines(tenantId!, recipe.id).then((data) => {
        if (data) {
          updateField('name', data.recipe.name);
          updateField('productId', data.recipe.productId);
          updateField('mode', data.recipe.mode);
          updateField('yieldQuantity', data.recipe.yieldQuantity);
          updateField('yieldUnit', data.recipe.yieldUnit);
          updateField('wastePct', data.recipe.wastePct);
          updateField('notes', data.recipe.notes || '');
          // Set lines
          const lines = data.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unit: l.unit,
          }));
          // We need to set lines directly
          lines.forEach((line, i) => {
            if (i === 0) {
              // First line already exists in initial state, update it
              updateLine(0, 'productId', line.productId);
              updateLine(0, 'quantity', line.quantity);
              updateLine(0, 'unit', line.unit);
            } else {
              // Add additional lines
              addLine();
              updateLine(i, 'productId', line.productId);
              updateLine(i, 'quantity', line.quantity);
              updateLine(i, 'unit', line.unit);
            }
          });
        }
        setLoadingRecipe(false);
      });
    }
  }, [recipe, getRecipeWithLines, updateField, addLine, updateLine]);

  const availableProducts = getAvailableProducts();
  const availableIngredients = getAvailableIngredients();

  // PRODUCTION-003 [Paso-2]: opciones de producto con "Crear nuevo" como primera opción
  const productOptions = [
    { value: NEW_PRODUCT_SENTINEL, label: '+ Crear nuevo producto terminado' },
    ...availableProducts.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.sku})`,
    })),
  ];

  const ingredientOptions = availableIngredients.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.sku})`,
  }));

  // PRODUCTION-003 [Paso-2]: categorías para el select del nuevo producto
  const categoryOptions = categories
    .filter((c) => !('deletedAt' in c) || !c.deletedAt)
    .map((c) => ({ value: c.id, label: c.name }));

  // PRODUCTION-003 [Paso-2]: detectar modo "Crear nuevo producto"
  const isCreatingNewProduct = form.productId === NEW_PRODUCT_SENTINEL;

  // PRODUCTION-001-012: Preview de líneas con distinción de sub-recetas
  const previewLines = getExpandPreview(form.lines);
  const hasSubRecipes = previewLines.some((l) => l.isSubRecipe);

  const handleSubmit = async () => {
    if (!tenantId || !userId) {
      addToast({ type: 'error', message: 'Sesión no disponible. Recarga la página.' });
      return;
    }

    const input = await toInput();
    if (!input) return;

    setIsSubmitting(true);
    try {
      if (recipe) {
        const success = await updateRecipe(recipe.id, input, tenantId);
        if (success) {
          addToast({ type: 'success', message: 'Receta actualizada.' });
          onClose();
        } else {
          const errMsg = storeError?.message || 'Error al actualizar la receta. Verifica tu conexión e intenta de nuevo.';
          addToast({ type: 'error', message: errMsg });
        }
      } else {
        const result = await createRecipe(tenantId, userId, input);
        if (result) {
          addToast({ type: 'success', message: 'Receta creada.' });
          onClose();
        } else {
          const errMsg = storeError?.message || 'Error al crear la receta. Verifica tu conexión e intenta de nuevo.';
          addToast({ type: 'error', message: errMsg });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingRecipe) {
    return (
      <Modal isOpen={true} onClose={onClose} title={recipe ? 'Editar Receta' : 'Nueva Receta'}>
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={recipe ? 'Editar Receta' : 'Nueva Receta'}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2"
          >
            {isSubmitting ? <Spinner size="sm" /> : <ChefHat size={16} />}
            {recipe ? 'Guardar Cambios' : 'Crear Receta'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Basic Info */}
        <div className="space-y-3">
          <Input
            label="Nombre de la receta"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Ej: Pan de Molde"
            error={errors.name}
            validation={{ required: true, maxLength: 25 }}
          />

          <SearchableSelect
            options={productOptions}
            value={form.productId}
            onChange={(value) => updateField('productId', value)}
            placeholder="Selecciona el producto que se crea"
          />
          {errors.productId && <p className="text-xs text-danger mt-1">{errors.productId}</p>}

          {/* PRODUCTION-003 [Paso-2]: Mini-form de auto-creación de producto_terminado */}
          {isCreatingNewProduct && (
            <Card className="p-3 bg-teal-50 border-teal-200 space-y-3">
              <div className="flex items-center gap-2 text-teal-700">
                <Package size={16} />
                <span className="text-sm font-semibold">Nuevo producto terminado</span>
              </div>
              <p className="text-xs text-teal-600">
                Se creará un nuevo producto que empezará sin stock. Al ejecutar la receta, se generarán lotes con su costo.
              </p>
              <Input
                label="Nombre del producto"
                value={form.newProductName}
                onChange={(e) => updateField('newProductName', e.target.value)}
                placeholder="Ej: Pan de jamón"
                error={errors.newProductName}
                validation={{ required: true, maxLength: 25 }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  label="SKU"
                  value={form.newProductSku}
                  onChange={(e) => updateField('newProductSku', e.target.value.toUpperCase())}
                  placeholder="Ej: PAN-001"
                  error={errors.newProductSku}
                  validation={{ required: true, maxLength: 18 }}
                />
                <Input
                  label="Precio de venta ($)"
                  type="number"
                  value={form.newProductPriceUsd || ''}
                  onChange={(e) => updateField('newProductPriceUsd', Number(e.target.value) || 0)}
                  placeholder="0.00"
                  min={0.01}
                  step={0.01}
                  error={errors.newProductPriceUsd}
                />
              </div>
              {categoryOptions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoría <span className="text-gray-600 text-xs">(opcional)</span>
                  </label>
                  <select
                    value={form.newProductCategoryId}
                    onChange={(e) => updateField('newProductCategoryId', e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Sin categoría</option>
                    {categoryOptions.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </Card>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                  w.type === 'warning' ? 'bg-warning/5 border border-warning/20' : 'bg-info/5 border border-info/20'
                }`}>
                  {w.type === 'warning' ? (
                    <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                  ) : (
                    <Info size={14} className="text-info shrink-0 mt-0.5" />
                  )}
                  <span className={w.type === 'warning' ? 'text-warning' : 'text-info'}>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modo</label>
              <div className="flex gap-2">
                <Button
                  variant={form.mode === 'batch' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => updateField('mode', 'batch')}
                  className="flex-1"
                >
                  Lote
                </Button>
                <Button
                  variant={form.mode === 'assembly' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => updateField('mode', 'assembly')}
                  className="flex-1"
                >
                  Ensamblaje
                </Button>
              </div>
            </div>

            <Input
              label="Merma %"
              type="number"
              value={form.wastePct}
              onChange={(e) => updateField('wastePct', Number(e.target.value))}
              min={0}
              max={100}
              error={errors.wastePct}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Cantidad producida"
              type="number"
              value={form.yieldQuantity}
              onChange={(e) => updateField('yieldQuantity', Number(e.target.value))}
              min={1}
              error={errors.yieldQuantity}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
              <select
                value={form.yieldUnit}
                onChange={(e) => updateField('yieldUnit', e.target.value)}
                className="input w-full"
              >
                <option value="unidad">Unidad</option>
                <option value="kg">Kg</option>
                <option value="lt">Litro</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ingredients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Ingredientes</h3>
            <Button variant="ghost" size="sm" onClick={addLine} className="flex items-center gap-1">
              <Plus size={14} />
              Agregar
            </Button>
          </div>

          {errors.lines && (
            <p className="text-xs text-danger mb-2">{errors.lines}</p>
          )}

          <div className="space-y-2">
            {form.lines.map((line, index) => {
              const preview = previewLines[index];
              return (
                <Card key={index} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div>
                        <SearchableSelect
                          options={ingredientOptions}
                          value={line.productId}
                          onChange={(value) => updateLine(index, 'productId', value)}
                          placeholder="Ingrediente"
                        />
                        {/* PRODUCTION-001-013: Badge "Sub-receta" para producto_terminado */}
                        {preview?.isSubRecipe && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md">
                            Sub-receta
                          </span>
                        )}
                        {errors[`line_${index}_product`] && (
                          <p className="text-xs text-danger mt-1">{errors[`line_${index}_product`]}</p>
                        )}
                      </div>
              <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, 'quantity', Number(e.target.value))}
                        min={0.01}
                        step={0.01}
                        placeholder="Cantidad"
                        error={errors[`line_${index}_quantity`]}
                      />
                      <select
                        value={line.unit}
                        onChange={(e) => updateLine(index, 'unit', e.target.value)}
                        className="input w-full"
                      >
                        <option value="g">Gramos</option>
                        <option value="ml">Mililitros</option>
                        <option value="unidad">Unidad</option>
                      </select>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(index)}
                    className="p-1.5 text-danger hover:text-danger shrink-0"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
              );
            })}
          </div>

          {form.lines.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">
              Agrega al menos un ingrediente
            </p>
          )}

          {/* PRODUCTION-001-014: Card collapsable con preview expandido */}
          {form.lines.length > 0 && (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="w-full flex items-center justify-between"
              >
                <span className="text-sm font-medium text-gray-700">
                  {showPreview ? 'Ocultar' : 'Ver'} desglose de ingredientes
                  {hasSubRecipes && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md">
                      {previewLines.filter((l) => l.isSubRecipe).length} sub-receta(s)
                    </span>
                  )}
                </span>
                {showPreview ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Button>

              {showPreview && (
                <Card className="mt-2 p-3 bg-gray-50">
                  <ul className="space-y-1.5 text-xs">
                    {previewLines.map((preview) => (
                      <li
                        key={preview.index}
                        className="flex items-center justify-between gap-2 p-2 bg-white rounded border border-gray-200"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-mono text-gray-500 shrink-0">#{preview.index + 1}</span>
                          <span className="truncate font-medium text-gray-700">{preview.productName}</span>
                          {preview.isSubRecipe && (
                            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded">
                              Sub-receta
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-gray-600">
                          {preview.quantity} {preview.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-gray-500 italic">
                    El desglose muestra las líneas tal como se guardarán. La expansión completa (con ingredientes base)
                    se calculará al ejecutar la receta.
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <Input
          label="Notas (opcional)"
          value={form.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Instrucciones adicionales..."
          validation={{ maxLength: 25 }}
        />
      </div>
    </Modal>
  );
}
