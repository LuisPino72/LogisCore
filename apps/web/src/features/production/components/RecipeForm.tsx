import { useState, useEffect } from 'react';
import { ChefHat, Plus, Trash2, AlertTriangle, Info } from 'lucide-react';
import { Button, Card, Modal, Input, SearchableSelect, Spinner } from '../../../common/components';
import { useRecipeForm } from '../hooks/useRecipeForm';
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
    validate, toInput,
    getAvailableIngredients, getAvailableProducts,
  } = useRecipeForm();

  const { createRecipe, updateRecipe, getRecipeWithLines } = useProductionStore();
  const { addToast } = useToastStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(!!recipe);

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

  const productOptions = availableProducts.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.sku})`,
  }));

  const ingredientOptions = availableIngredients.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.sku})`,
  }));

  const handleSubmit = async () => {
    if (!validate() || !tenantId || !userId) return;

    const input = toInput();
    if (!input) return;

    setIsSubmitting(true);
    try {
      if (recipe) {
        const success = await updateRecipe(recipe.id, input, tenantId);
        if (success) {
          addToast({ type: 'success', message: 'Receta actualizada.' });
          onClose();
        } else {
          addToast({ type: 'error', message: 'Error al actualizar la receta.' });
        }
      } else {
        const result = await createRecipe(tenantId, userId, input);
        if (result) {
          addToast({ type: 'success', message: 'Receta creada.' });
          onClose();
        } else {
          addToast({ type: 'error', message: 'Error al crear la receta.' });
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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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
            {form.lines.map((line, index) => (
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
            ))}
          </div>

          {form.lines.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">
              Agrega al menos un ingrediente
            </p>
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
