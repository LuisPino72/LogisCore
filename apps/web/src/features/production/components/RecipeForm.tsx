import { useState, useEffect } from 'react';
import { ChefHat, Plus, Trash2, AlertTriangle, Info, ChevronDown, ChevronUp, Package, ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
import { Button, Card, Modal, Input, SearchableSelect, Select, Spinner, Tooltip } from '../../../common/components';
import { useRecipeForm } from '../hooks/useRecipeForm';
import { useProductionStore } from '../stores/productionStore';
import { useToastStore } from '../../../stores/toastStore';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { formatUsd } from '@/lib/formatBs';
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
                    ? 'bg-primary text-white shadow-md shadow-primary/30 ring-2 ring-primary/20'
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
              <div className={`flex-1 h-0.5 mx-2 mt-0 sm:mt-[-14px] rounded transition-all duration-300 ${
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
    form, errors, warnings, estimatedCost,
    currentStep, totalSteps,
    updateField, addLine, updateLine, removeLine,
    nextStep, prevStep,
    toInput,
    getAvailableIngredients,
    getExpandPreview, categories,
    getUnitOptions,
  } = useRecipeForm();

  const { createRecipe, updateRecipe, getRecipeWithLines } = useProductionStore();
  const storeError = useProductionStore((s) => s.error);
  const { addToast } = useToastStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(!!recipe);
  const [showPreview, setShowPreview] = useState(false);
  const { ivaRate } = useSettingsStore();

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
            id: l.id,
            productId: l.productId,
            quantity: l.quantity,
            unit: l.unit,
          }));
          updateField('lines', lines);
        }
        setLoadingRecipe(false);
      });
    }
  }, [recipe, getRecipeWithLines, updateField]);

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
    const maxSteps = 2;
    return (
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Editar Receta"
        footer={
          <div className="flex gap-2 justify-between flex-wrap">
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
              {currentStep < maxSteps ? (
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
        <ProgressBar currentStep={currentStep} totalSteps={maxSteps} isEdit={true} />

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
                      <Card key={index} className="p-2.5 space-y-4">
                        <SearchableSelect
                          options={ingredientOptions}
                          value={line.productId}
                          onChange={(value) => updateLine(index, 'productId', value)}
                          placeholder="Ingrediente"
                        />
                        {preview?.isSubRecipe && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md wrap-break-word">
                            Sub-receta
                          </span>
                        )}
                        {errors[`line_${index}_product`] && (
                          <p className="text-xs text-danger wrap-break-word">{errors[`line_${index}_product`]}</p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) => updateLine(index, 'quantity', Number(e.target.value))}
                            step={0.01}
                            placeholder="Cantidad"
                            validation={{ required: true, min: 0.01, max: 99999 }}
                            error={errors[`line_${index}_quantity`]}
                          />
                          <div>
                            <Select
                              value={line.unit}
                              onChange={(e) => updateLine(index, 'unit', e.target.value)}
                              error={errors[`line_${index}_unit`]}
                            >
                              {getUnitOptions(line.productId).map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </Select>
                          </div>
                        </div>
                        <div className="flex justify-center pt-1">
                          <Tooltip content="Eliminar ingrediente" variant="help">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLine(index)}
                              className="text-danger hover:text-danger p-2 min-h-[48px] min-w-[48px]"
                            >
                              <Trash2 size={20} />
                            </Button>
                          </Tooltip>
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
                                  <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded">
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
                        <p className="mt-2 text-xs text-gray-500 italic wrap-break-word">
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
                inputMode="decimal"
                value={form.wastePct}
                onChange={(e) => updateField('wastePct', Number(e.target.value))}
                min={0}
                max={100}
                error={errors.wastePct}
                validation={{ min: 0, max: 100 }}
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
                  {estimatedCost.totalCost > 0 && (
                    <div className="flex justify-between">
                      <span>Costo estimado:</span>
                      <span className="font-medium text-gray-800">{formatUsd(estimatedCost.totalCost)}</span>
                    </div>
                  )}
                  {form.mode === 'batch' && estimatedCost.costPerUnit > 0 && (
                    <div className="flex justify-between">
                      <span>Costo/unidad:</span>
                      <span className="font-semibold text-primary">{formatUsd(estimatedCost.costPerUnit)}</span>
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
  const categoryOptions = categories
    .filter((c) => !('deletedAt' in c) || !c.deletedAt)
    .map((c) => ({ value: c.id, label: c.name }));

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Nueva Receta"
      footer={
        <div className="flex gap-2 justify-between flex-wrap">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Producto que se crea (nuevo)</label>
            </div>

            <Card className="p-3 bg-linear-to-br from-teal-50 to-teal-100/80 border-teal-200 space-y-3">
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
                autoComplete="off"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  label="SKU"
                  value={form.newProductSku}
                  onChange={(e) => updateField('newProductSku', e.target.value.toUpperCase())}
                  placeholder="Ej: PAN-001"
                  error={errors.newProductSku}
                  validation={{ required: true, maxLength: 18 }}
                  autoComplete="off"
                />
                <Input
                  label="Precio de venta ($)"
                  type="number"
                  inputMode="decimal"
                  value={form.newProductPriceUsd || ''}
                  onChange={(e) => updateField('newProductPriceUsd', Number(e.target.value) || 0)}
                  placeholder="0.00"
                  min={0.01}
                  step={0.01}
                  error={errors.newProductPriceUsd}
                  validation={{ required: true, min: 0.01 }}
                />
              </div>
              {categoryOptions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoría <span className="text-danger">*</span>
                  </label>
                  <SearchableSelect
                    options={[{ value: '', label: 'Seleccionar categoría...' }, ...categoryOptions]}
                    value={form.newProductCategoryId}
                    onChange={(value) => updateField('newProductCategoryId', value)}
                    placeholder="Seleccionar categoría..."
                    searchPlaceholder="Buscar categoría..."
                  />
                </div>
              )}
            </Card>

            <label className="flex items-center gap-2 cursor-pointer py-2">
              <input
                type="checkbox"
                checked={form.newProductIsTaxable}
                onChange={(e) => updateField('newProductIsTaxable', e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm text-gray-700">Cobrar IVA ({(ivaRate * 100).toFixed(0)}%) al producto terminado</span>
            </label>

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
                  <Card key={index} className="p-2.5 space-y-4">
                    <SearchableSelect
                      options={ingredientOptions}
                      value={line.productId}
                      onChange={(value) => updateLine(index, 'productId', value)}
                      placeholder="Ingrediente"
                    />
                    {preview?.isSubRecipe && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md wrap-break-word">
                        Sub-receta
                      </span>
                    )}
                    {errors[`line_${index}_product`] && (
                      <p className="text-xs text-danger wrap-break-word">{errors[`line_${index}_product`]}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, 'quantity', Number(e.target.value))}
                        min={0.01}
                        step={0.01}
                        placeholder="Cantidad"
                        error={errors[`line_${index}_quantity`]}
                      />
                      <div>
                        <Select
                          value={line.unit}
                          onChange={(e) => updateLine(index, 'unit', e.target.value)}
                          error={errors[`line_${index}_unit`]}
                        >
                          {getUnitOptions(line.productId).map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-center pt-1">
                      <Tooltip content="Eliminar ingrediente" variant="help">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(index)}
                          className="text-danger hover:text-danger p-2 min-h-[48px] min-w-[48px]"
                        >
                          <Trash2 size={20} />
                        </Button>
                      </Tooltip>
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
                              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded">
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
                    <p className="mt-2 text-xs text-gray-500 italic wrap-break-word">
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
                inputMode="decimal"
                value={form.wastePct}
                onChange={(e) => updateField('wastePct', Number(e.target.value))}
                min={0}
                max={100}
                error={errors.wastePct}
                validation={{ min: 0, max: 100 }}
              />
              {form.mode === 'batch' ? (
                <>
                  <Input
                    label="Cantidad producida"
                    type="number"
                    inputMode="numeric"
                    value={form.yieldQuantity}
                    onChange={(e) => updateField('yieldQuantity', Number(e.target.value))}
                    min={1}
                    max={10000}
                    error={errors.yieldQuantity}
                    validation={{ required: true, min: 1, max: 10000 }}
                  />
                </>
              ) : null}
            </div>

            {form.mode === 'batch' && (
              <div>
                <Select
                  label="Unidad"
                  value={form.yieldUnit}
                  onChange={(e) => updateField('yieldUnit', e.target.value)}
                  error={errors.yieldUnit}
                >
                  <option value="unidad">Unidad</option>
                  <option value="kg">Kg</option>
                  <option value="lt">Litro</option>
                </Select>
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
                {estimatedCost.totalCost > 0 && (
                  <div className="flex justify-between">
                    <span>Costo estimado:</span>
                    <span className="font-medium text-gray-800">{formatUsd(estimatedCost.totalCost)}</span>
                  </div>
                )}
                {form.mode === 'batch' && estimatedCost.costPerUnit > 0 && (
                  <div className="flex justify-between">
                    <span>Costo/unidad:</span>
                    <span className="font-semibold text-primary">{formatUsd(estimatedCost.costPerUnit)}</span>
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
