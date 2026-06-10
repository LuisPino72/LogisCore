import { useState, useEffect } from 'react';
import { ChefHat, Plus, Trash2, AlertTriangle, Info, ChevronDown, ChevronUp, Package, ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
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

function ProgressBar({ currentStep, totalSteps, isEdit }: { currentStep: number; totalSteps: number; isEdit: boolean }) {
  const steps = isEdit
    ? [
        { num: 1, label: 'Receta' },
        { num: 2, label: 'Configurar' },
      ]
    : [
        { num: 1, label: 'Info básica' },
        { num: 2, label: 'Ingredientes' },
        { num: 3, label: 'Configurar' },
      ];

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        {steps.map((step, i) => (
          <div key={step.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                  currentStep > step.num
                    ? 'bg-success text-white'
                    : currentStep === step.num
                    ? 'bg-primary text-white shadow-md shadow-primary/30'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {currentStep > step.num ? <Check size={14} /> : step.num}
              </div>
              <span className={`text-[10px] mt-1 font-medium hidden sm:block ${
                currentStep >= step.num ? 'text-gray-700' : 'text-gray-400'
              }`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mt-0 sm:mt-[-14px] rounded transition-colors duration-200 ${
                currentStep > step.num ? 'bg-success' : 'bg-gray-200'
              }`} />
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 text-center sm:text-left">
        Paso {currentStep} de {totalSteps} — {steps[currentStep - 1].label}
      </p>
    </div>
  );
}

export function RecipeForm({ recipe, tenantId, userId, onClose }: RecipeFormProps) {
  const isEdit = !!recipe;

  const {
    form, errors, warnings,
    currentStep, totalSteps,
    updateField, addLine, updateLine, removeLine,
    nextStep, prevStep,
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
          const lines = data.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unit: l.unit,
          }));
          lines.forEach((line, i) => {
            if (i === 0) {
              updateLine(0, 'productId', line.productId);
              updateLine(0, 'quantity', line.quantity);
              updateLine(0, 'unit', line.unit);
            } else {
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

  const availableIngredients = getAvailableIngredients();

  const ingredientOptions = availableIngredients.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.sku})`,
  }));

  const previewLines = getExpandPreview(form.lines);
  const hasSubRecipes = previewLines.some((l) => l.isSubRecipe);

  const handleNext = async () => {
    await nextStep(isEdit);
  };

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
      <Modal isOpen={true} onClose={onClose} title={isEdit ? 'Editar Receta' : 'Nueva Receta'}>
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      </Modal>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // EDIT MODE — Simplified: Step 1 (name + ingredients), Step 2 (waste + notes)
  // ═══════════════════════════════════════════════════════════
  if (isEdit) {
    return (
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Editar Receta"
        footer={
          <div className="flex gap-2 justify-between">
            <div>
              {currentStep > 1 && (
                <Button variant="ghost" onClick={prevStep} className="flex items-center gap-1">
                  <ArrowLeft size={14} />
                  Atrás
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              {currentStep < totalSteps ? (
                <Button variant="primary" onClick={handleNext} className="flex items-center gap-1">
                  Siguiente
                  <ArrowRight size={14} />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex items-center gap-2"
                >
                  {isSubmitting ? <Spinner size="sm" /> : <ChefHat size={16} />}
                  Guardar Cambios
                </Button>
              )}
            </div>
          </div>
        }
      >
        <ProgressBar currentStep={currentStep} totalSteps={totalSteps} isEdit={true} />

        <div className="space-y-4">
          {/* ════════ PASO 1: Nombre + Ingredientes ════════ */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fade-in">
              <Input
                label="Nombre de la receta"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Ej: Pan de Molde"
                error={errors.name}
                validation={{ required: true, maxLength: 25 }}
              />

              {/* Read-only info */}
              <Card className="p-3 bg-gray-50 border-gray-200">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Lock size={12} />
                  <span className="wrap-break-word">
                    Modo: <strong>{recipe.mode === 'batch' ? 'Lote' : 'Ensamblaje'}</strong>
                    {recipe.mode === 'batch' && (
                      <> · Rendimiento: <strong>{recipe.yieldQuantity} {recipe.yieldUnit}</strong></>
                    )}
                  </span>
                </div>
              </Card>

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
                  <p className="text-xs text-danger wrap-break-word">{errors.lines}</p>
                )}

                <div className="space-y-2">
                  {form.lines.map((line, index) => {
                    const preview = previewLines[index];
                    return (
                      <Card key={index} className="p-3">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-2 min-w-0">
                            <div>
                              <SearchableSelect
                                options={ingredientOptions}
                                value={line.productId}
                                onChange={(value) => updateLine(index, 'productId', value)}
                                placeholder="Ingrediente"
                              />
                              {preview?.isSubRecipe && (
                                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md wrap-break-word">
                                  Sub-receta
                                </span>
                              )}
                              {errors[`line_${index}_product`] && (
                                <p className="text-xs text-danger mt-1 wrap-break-word">{errors[`line_${index}_product`]}</p>
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
                            className="p-1.5 text-danger hover:text-danger shrink-0 min-h-[44px] min-w-[44px]"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {form.lines.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-4 wrap-break-word">
                    Agrega al menos un ingrediente para continuar
                  </p>
                )}

                {form.lines.length > 0 && (
                  <div className="mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPreview(!showPreview)}
                      className="w-full flex items-center justify-between"
                    >
                      <span className="text-sm font-medium text-gray-700 wrap-break-word">
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
                                <span className="truncate font-medium text-gray-700 wrap-break-word">{preview.productName}</span>
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
                        <p className="mt-2 text-[11px] text-gray-500 italic wrap-break-word">
                          El desglose muestra las líneas tal como se guardarán. La expansión completa se calculará al ejecutar la receta.
                        </p>
                      </Card>
                    )}
                  </div>
                )}

                {warnings.filter((w) => w.field.startsWith('line_')).length > 0 && (
                  <div className="space-y-1 mt-2">
                    {warnings.filter((w) => w.field.startsWith('line_')).map((w, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg text-xs bg-warning/5 border border-warning/20">
                        <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                        <span className="text-warning wrap-break-word">{w.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════ PASO 2: Merma + Notas ════════ */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-fade-in">
              <Input
                label="Merma %"
                type="number"
                value={form.wastePct}
                onChange={(e) => updateField('wastePct', Number(e.target.value))}
                min={0}
                max={100}
                error={errors.wastePct}
              />

              <Input
                label="Notas (opcional)"
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Instrucciones adicionales..."
                validation={{ maxLength: 25 }}
              />

              <Card className="p-3 bg-gray-50 border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Resumen</h4>
                <div className="space-y-1.5 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <span>Receta:</span>
                    <span className="font-medium text-gray-800 wrap-break-word text-right ml-2">{form.name || 'Sin nombre'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ingredientes:</span>
                    <span className="font-medium text-gray-800">{form.lines.length}</span>
                  </div>
                  {form.wastePct > 0 && (
                    <div className="flex justify-between">
                      <span>Merma:</span>
                      <span className="font-medium text-warning">{form.wastePct}%</span>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // CREATE MODE — Full wizard: 3 steps (info, ingredients, config)
  // ═══════════════════════════════════════════════════════════
  const availableProducts = getAvailableProducts();
  const productOptions = [
    { value: NEW_PRODUCT_SENTINEL, label: '+ Crear nuevo producto terminado' },
    ...availableProducts.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.sku})`,
    })),
  ];

  const categoryOptions = categories
    .filter((c) => !('deletedAt' in c) || !c.deletedAt)
    .map((c) => ({ value: c.id, label: c.name }));

  const isCreatingNewProduct = form.productId === NEW_PRODUCT_SENTINEL;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Nueva Receta"
      footer={
        <div className="flex gap-2 justify-between">
          <div>
            {currentStep > 1 && (
              <Button variant="ghost" onClick={prevStep} className="flex items-center gap-1">
                <ArrowLeft size={14} />
                Atrás
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            {currentStep < totalSteps ? (
              <Button variant="primary" onClick={handleNext} className="flex items-center gap-1">
                Siguiente
                <ArrowRight size={14} />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2"
              >
                {isSubmitting ? <Spinner size="sm" /> : <ChefHat size={16} />}
                Crear Receta
              </Button>
            )}
          </div>
        </div>
      }
    >
      <ProgressBar currentStep={currentStep} totalSteps={totalSteps} isEdit={false} />

      <div className="space-y-4">
        {/* ═══════════════ PASO 1: Info Básica ═══════════════ */}
        {currentStep === 1 && (
          <div className="space-y-3 animate-fade-in">
            <Input
              label="Nombre de la receta"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Ej: Pan de Molde"
              error={errors.name}
              validation={{ required: true, maxLength: 25 }}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Producto que se crea</label>
              <SearchableSelect
                options={productOptions}
                value={form.productId}
                onChange={(value) => updateField('productId', value)}
                placeholder="Selecciona el producto"
              />
            </div>

            {isCreatingNewProduct && (
              <Card className="p-3 bg-teal-50 border-teal-200 space-y-3">
                <div className="flex items-center gap-2 text-teal-700">
                  <Package size={16} />
                  <span className="text-sm font-semibold wrap-break-word">Nuevo producto terminado</span>
                </div>
                <p className="text-xs text-teal-600 wrap-break-word">
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
              {form.mode === 'assembly' && (
                <p className="text-xs text-info mt-1 wrap-break-word">
                  En modo ensamblaje, el producto se consume al vender. No se genera stock.
                </p>
              )}
            </div>

            {warnings.length > 0 && (
              <div className="space-y-1">
                {warnings.filter((w) => w.field === 'productId').map((w, i) => (
                  <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                    w.type === 'warning' ? 'bg-warning/5 border border-warning/20' : 'bg-info/5 border border-info/20'
                  }`}>
                    {w.type === 'warning' ? (
                      <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                    ) : (
                      <Info size={14} className="text-info shrink-0 mt-0.5" />
                    )}
                    <span className={`wrap-break-word ${w.type === 'warning' ? 'text-warning' : 'text-info'}`}>{w.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ PASO 2: Ingredientes ═══════════════ */}
        {currentStep === 2 && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Ingredientes</h3>
              <Button variant="ghost" size="sm" onClick={addLine} className="flex items-center gap-1">
                <Plus size={14} />
                Agregar
              </Button>
            </div>

            {errors.lines && (
              <p className="text-xs text-danger wrap-break-word">{errors.lines}</p>
            )}

            <div className="space-y-2">
              {form.lines.map((line, index) => {
                const preview = previewLines[index];
                return (
                  <Card key={index} className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2 min-w-0">
                        <div>
                          <SearchableSelect
                            options={ingredientOptions}
                            value={line.productId}
                            onChange={(value) => updateLine(index, 'productId', value)}
                            placeholder="Ingrediente"
                          />
                          {preview?.isSubRecipe && (
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md wrap-break-word">
                              Sub-receta
                            </span>
                          )}
                          {errors[`line_${index}_product`] && (
                            <p className="text-xs text-danger mt-1 wrap-break-word">{errors[`line_${index}_product`]}</p>
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
                        className="p-1.5 text-danger hover:text-danger shrink-0 min-h-[44px] min-w-[44px]"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {form.lines.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4 wrap-break-word">
                Agrega al menos un ingrediente para continuar
              </p>
            )}

            {form.lines.length > 0 && (
              <div className="mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="w-full flex items-center justify-between"
                >
                  <span className="text-sm font-medium text-gray-700 wrap-break-word">
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
                            <span className="truncate font-medium text-gray-700 wrap-break-word">{preview.productName}</span>
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
                    <p className="mt-2 text-[11px] text-gray-500 italic wrap-break-word">
                      El desglose muestra las líneas tal como se guardarán. La expansión completa se calculará al ejecutar la receta.
                    </p>
                  </Card>
                )}
              </div>
            )}

            {warnings.filter((w) => w.field.startsWith('line_')).length > 0 && (
              <div className="space-y-1">
                {warnings.filter((w) => w.field.startsWith('line_')).map((w, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg text-xs bg-warning/5 border border-warning/20">
                    <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                    <span className="text-warning wrap-break-word">{w.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ PASO 3: Configuración + Resumen ═══════════════ */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Merma %"
                type="number"
                value={form.wastePct}
                onChange={(e) => updateField('wastePct', Number(e.target.value))}
                min={0}
                max={100}
                error={errors.wastePct}
              />
              {form.mode === 'batch' ? (
                <>
                  <Input
                    label="Cantidad producida"
                    type="number"
                    value={form.yieldQuantity}
                    onChange={(e) => updateField('yieldQuantity', Number(e.target.value))}
                    min={1}
                    error={errors.yieldQuantity}
                  />
                </>
              ) : null}
            </div>

            {form.mode === 'batch' && (
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
                {errors.yieldUnit && <p className="text-xs text-danger mt-1 wrap-break-word">{errors.yieldUnit}</p>}
              </div>
            )}

            <Input
              label="Notas (opcional)"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Instrucciones adicionales..."
              validation={{ maxLength: 25 }}
            />

            {warnings.filter((w) => w.field !== 'productId' && !w.field.startsWith('line_')).length > 0 && (
              <div className="space-y-1">
                {warnings.filter((w) => w.field !== 'productId' && !w.field.startsWith('line_')).map((w, i) => (
                  <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                    w.type === 'warning' ? 'bg-warning/5 border border-warning/20' : 'bg-info/5 border border-info/20'
                  }`}>
                    {w.type === 'warning' ? (
                      <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                    ) : (
                      <Info size={14} className="text-info shrink-0 mt-0.5" />
                    )}
                    <span className={`wrap-break-word ${w.type === 'warning' ? 'text-warning' : 'text-info'}`}>{w.message}</span>
                  </div>
                ))}
              </div>
            )}

            <Card className="p-3 bg-gray-50 border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Resumen</h4>
              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Receta:</span>
                  <span className="font-medium text-gray-800 wrap-break-word text-right ml-2">{form.name || 'Sin nombre'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Modo:</span>
                  <span className="font-medium text-gray-800">{form.mode === 'batch' ? 'Lote' : 'Ensamblaje'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ingredientes:</span>
                  <span className="font-medium text-gray-800">{form.lines.length}</span>
                </div>
                {form.mode === 'batch' && (
                  <div className="flex justify-between">
                    <span>Rendimiento:</span>
                    <span className="font-medium text-gray-800">{form.yieldQuantity} {form.yieldUnit}</span>
                  </div>
                )}
                {form.wastePct > 0 && (
                  <div className="flex justify-between">
                    <span>Merma:</span>
                    <span className="font-medium text-warning">{form.wastePct}%</span>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </Modal>
  );
}
