import { useState, useEffect, useCallback } from 'react';
import { Utensils, AlertTriangle, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { Alert, Button, Card, Modal, Input, Spinner } from '../../../common/components';
import { useProductionStore } from '../stores/productionStore';
import { useToastStore } from '../../../stores/toastStore';
import type { Recipe, IngredientAvailability } from '../types';

interface ProduceModalProps {
  recipe: Recipe;
  tenantId: string | null;
  userId: string | undefined;
  onClose: () => void;
}

export function ProduceModal({ recipe, tenantId, userId, onClose }: ProduceModalProps) {
  const { checkIngredientsAvailability, calculateRecipeCost, createOrder } = useProductionStore();
  const { addToast } = useToastStore();

  const [batchCount, setBatchCountState] = useState(1);
  const [ingredientAvailability, setIngredientAvailability] = useState<IngredientAvailability[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [isProducing, setIsProducing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const fetchAvailability = useCallback(async (count: number) => {
    if (!recipe || count <= 0) return;
    setIsChecking(true);
    try {
      const [availability, cost] = await Promise.all([
        checkIngredientsAvailability(recipe.id, count),
        calculateRecipeCost(recipe.id, count),
      ]);
      setIngredientAvailability(availability);
      setEstimatedCost(cost);
    } catch {
      setError('Error al verificar disponibilidad.');
    } finally {
      setIsChecking(false);
    }
  }, [recipe, checkIngredientsAvailability, calculateRecipeCost]);

  // Initial fetch on mount
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      fetchAvailability(1);
    }
  }, [initialized, fetchAvailability]);

  const handleBatchChange = async (value: number) => {
    if (value > 0) {
      setBatchCountState(value);
      await fetchAvailability(value);
    }
  };

  const allIngredientsAvailable = ingredientAvailability.length > 0 && ingredientAvailability.every((i) => i.sufficient);

  const handleConfirm = () => {
    if (!allIngredientsAvailable) return;
    setConfirmStep(true);
  };

  const handleProduce = async () => {
    if (!tenantId || !userId) return;
    setIsProducing(true);
    setError(null);

    const result = await createOrder(tenantId, userId, {
      recipeId: recipe.id,
      batchCount,
    });

    if (result) {
      addToast({
        type: 'success',
        message: `¡${batchCount} lote(s) de "${recipe.name}" producido(s)!`,
      });
      onClose();
    } else {
      setIsProducing(false);
      setConfirmStep(false);
      setError('Error al producir. Verifica que la receta esté activa y haya stock suficiente.');
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={() => { setConfirmStep(false); onClose(); }}
      title={confirmStep ? '¿Confirmar producción?' : 'Producir'}
      footer={
        confirmStep ? (
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setConfirmStep(false)} disabled={isProducing}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleProduce}
              disabled={isProducing}
              className="flex items-center gap-2"
            >
              {isProducing ? <Spinner size="sm" /> : <CheckCircle2 size={16} />}
              {isProducing ? 'Produciendo...' : 'Sí, producir'}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isProducing || isChecking || !allIngredientsAvailable}
              className="flex items-center gap-2"
            >
              {isProducing ? <Spinner size="sm" /> : <Utensils size={16} />}
              Producir
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {confirmStep ? (
          <Alert variant="warning" icon={<HelpCircle size={20} />} title={`¿Estás seguro de producir ${batchCount} lote(s)?`}>
            <p>Se descontarán los ingredientes del inventario y se creará stock de producto terminado. Esta acción no se puede deshacer.</p>
            <p className="mt-1"><strong>{recipe.name}</strong> · {recipe.yieldQuantity * batchCount} {recipe.yieldUnit} · ${estimatedCost.toFixed(2)}</p>
          </Alert>
        ) : (
          <>
            {/* Recipe Info */}
            <Card className="p-3 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2">
                <Utensils size={18} className="text-primary" />
                <div>
                  <h3 className="font-semibold text-sm">{recipe.name}</h3>
                  <p className="text-xs text-gray-500">
                    Yield por lote: {recipe.yieldQuantity} {recipe.yieldUnit}
                    {recipe.wastePct > 0 && (
                      <span className="ml-1 text-warning">· Merma: {recipe.wastePct}%</span>
                    )}
                  </p>
                </div>
              </div>
            </Card>

            {/* Batch Count */}
            <Input
              label="Cantidad de lotes (máx 1000)"
              type="number"
              value={batchCount}
              onChange={(e) => handleBatchChange(Number(e.target.value))}
              min={1}
              max={1000}
            />

            {/* Total Production */}
            <div className="text-sm text-gray-600">
              Producirás: <strong>{recipe.yieldQuantity * batchCount} {recipe.yieldUnit}</strong>
            </div>

            {/* Ingredient Availability */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Ingredientes</h4>
              {isChecking ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : (
                <div className="space-y-2">
                  {ingredientAvailability.map((item) => (
                    <div
                      key={item.productId}
                      className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                        item.sufficient
                          ? 'bg-success/5 border border-success/20'
                          : 'bg-danger/5 border border-danger/20'
                      }`}
                    >
                      <span className="truncate flex-1">{item.productName}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-mono text-xs ${item.sufficient ? 'text-success' : 'text-danger'}`}>
                          {item.needed} / {item.available} {item.unit}
                        </span>
                        {item.sufficient ? (
                          <CheckCircle2 size={14} className="text-success" />
                        ) : (
                          <XCircle size={14} className="text-danger" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cost Estimate */}
            {estimatedCost > 0 && (
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Costo estimado:</span>
                <span className="font-semibold text-sm">${estimatedCost.toFixed(2)}</span>
              </div>
            )}

        {/* Warning */}
        {!allIngredientsAvailable && !isChecking && ingredientAvailability.length > 0 && (
          <Alert variant="warning" icon={<AlertTriangle size={16} />}>
            No hay suficiente stock de algunos ingredientes. Ajusta la cantidad de lotes o repone inventario.
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert variant="error">
            {error}
          </Alert>
        )}
          </>
        )}
      </div>
    </Modal>
  );
}
