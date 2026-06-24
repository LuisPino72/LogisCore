import { useState, useEffect, useCallback } from 'react';
import { Utensils, AlertTriangle, CheckCircle2, XCircle, HelpCircle, Package } from 'lucide-react';
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
  // PRODUCTION-003 [Paso-5]: warnings de ingredientes sin costo registrado.
  // No bloquean el guardado; se muestran al bodeguero como contexto.
  const [costWarnings, setCostWarnings] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isProducing, setIsProducing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [excessiveStockWarning, setExcessiveStockWarning] = useState<string | null>(null);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [missingIngredients, setMissingIngredients] = useState<{ name: string; needed: number; available: number; unit: string }[]>([]);

  const fetchAvailability = useCallback(async (count: number) => {
    if (!recipe || count <= 0) return;
    setIsChecking(true);
    try {
      const [availability, cost] = await Promise.all([
        checkIngredientsAvailability(tenantId!, recipe.id, count),
        calculateRecipeCost(recipe.id, count),
      ]);
      setIngredientAvailability(availability);
      setEstimatedCost(cost.totalCost);
      setCostWarnings(cost.warnings);
    } catch {
      setError('No se pudo verificar. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setIsChecking(false);
    }
  }, [recipe, checkIngredientsAvailability, calculateRecipeCost]);

  // Initial fetch on mount
  useEffect(() => {
    fetchAvailability(1);
  }, []);

  const handleBatchChange = async (value: number) => {
    if (value <= 0) {
      setBatchError('Debes producir al menos 1 lote.');
      return;
    }
    if (value > 1000) {
      setBatchError('No se pueden producir más de 1000 lotes por orden.');
      return;
    }
    setBatchError(null);
    
    // Check for excessive stock warning (> 100k units)
    const totalProduction = recipe.yieldQuantity * value;
    if (totalProduction > 100_000) {
      setExcessiveStockWarning(`Se producirán ${totalProduction.toLocaleString()} ${recipe.yieldUnit}. ¿Estás seguro? Stock muy alto.`);
    } else {
      setExcessiveStockWarning(null);
    }
    
    setBatchCountState(value);
    await fetchAvailability(value);
  };

  const allIngredientsAvailable = ingredientAvailability.length > 0 && ingredientAvailability.every((i) => i.sufficient);

  const handleConfirm = () => {
    if (allIngredientsAvailable) {
      setConfirmStep(true);
    } else {
      // Show override confirmation with missing ingredients list
      const missing = ingredientAvailability.filter(i => !i.sufficient).map(i => ({
        name: i.productName,
        needed: i.needed,
        available: i.available,
        unit: i.unit,
      }));
      setMissingIngredients(missing);
      setShowOverrideConfirm(true);
    }
  };

  const handleProduce = async (override = false) => {
    if (!tenantId || !userId) return;
    setIsProducing(true);
    setError(null);

    const result = await createOrder(tenantId, userId, {
      recipeId: recipe.id,
      batchCount,
    }, { allowOverride: override });

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
              onClick={() => handleProduce(false)}
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
              disabled={isProducing || isChecking}
              className="flex items-center gap-2"
              title={!allIngredientsAvailable && !isChecking && ingredientAvailability.length > 0 ? 'Algunos ingredientes tienen stock bajo. Toca para ver opciones.' : undefined}
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
            <p className="mt-1 wrap-break-word"><strong>{recipe.name}</strong> · {recipe.yieldQuantity * batchCount} {recipe.yieldUnit} · ${estimatedCost.toFixed(2)}</p>
          </Alert>
        ) : (
          <>
            {/* Recipe Info */}
            <Card className="p-3 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2">
                <Utensils size={18} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm wrap-break-word">{recipe.name}</h3>
                  <p className="text-xs text-gray-500 wrap-break-word">
                    Rendimiento por lote: {recipe.yieldQuantity} {recipe.yieldUnit}
                    {recipe.wastePct > 0 && (
                      <span className="inline-flex items-center text-[10px] font-medium bg-warning/10 text-warning px-1.5 py-0.5 rounded-full ml-1">Merma {recipe.wastePct}%</span>
                    )}
                  </p>
                </div>
              </div>
            </Card>

            {/* Batch Count */}
            <Input
              label="Cantidad de lotes (máx 1000)"
              type="number"
              inputMode="numeric"
              value={batchCount}
              onChange={(e) => handleBatchChange(Number(e.target.value))}
              min={1}
              max={1000}
              error={batchError || undefined}
              validation={{ required: true, min: 1, max: 1000 }}
            />

            {/* Total Production — more prominent */}
            <div className="flex items-center justify-between p-3 bg-linear-to-r from-primary/5 to-primary/10 rounded-lg border border-primary/15 total-glow">
              <span className="text-sm text-gray-600">Total a producir:</span>
              <span className="font-bold text-base text-primary">{recipe.yieldQuantity * batchCount} {recipe.yieldUnit}</span>
            </div>

            {/* Excessive Stock Warning */}
            {excessiveStockWarning && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <span className="text-sm text-amber-800 wrap-break-word">{excessiveStockWarning}</span>
              </div>
            )}

            {/* Ingredient Availability */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Package size={14} className="text-primary/60" />
                Ingredientes
              </h4>
              {isChecking ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : (
                <div className="space-y-2">
                  {ingredientAvailability.map((item) => (
                    <div
                      key={item.productId}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2.5 rounded-lg text-sm border-l-[3px] transition-colors ${
                        item.sufficient
                          ? 'bg-success/5 border border-success/20 border-l-success'
                          : 'bg-danger/5 border border-danger/20 border-l-danger'
                      }`}
                    >
                      <span className="wrap-break-word font-medium">{item.productName}</span>
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
            {(estimatedCost > 0 || costWarnings.length > 0) && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-sm text-gray-600">Costo estimado:</span>
                <span className="font-bold text-base text-gray-800">${estimatedCost.toFixed(2)}</span>
              </div>
            )}

            {/* Cost Warnings — PRODUCTION-003 [Paso-5] */}
            {costWarnings.length > 0 && (
              <Alert variant="warning" icon={<AlertTriangle size={16} />} title="Costo estimado impreciso">
                <ul className="list-disc list-inside text-sm space-y-0.5">
                  {costWarnings.map((msg) => (
                    <li key={msg} className="wrap-break-word">{msg}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs wrap-break-word">El costo puede ser incorrecto. Registra el costo de los ingredientes faltantes para mejorar la precisión.</p>
              </Alert>
            )}

        {/* Warning */}
        {!allIngredientsAvailable && !isChecking && ingredientAvailability.length > 0 && (
          <Alert variant="warning" icon={<AlertTriangle size={16} />}>
            <span className="wrap-break-word">No hay suficiente stock de algunos ingredientes. Ajusta la cantidad de lotes o repone inventario.</span>
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert variant="error">
            <span className="wrap-break-word">{error}</span>
          </Alert>
        )}
          </>
        )}
        
        {/* Override Confirmation Modal */}
        {showOverrideConfirm && missingIngredients.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle size={24} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Stock insuficiente</h3>
                  <p className="text-sm text-gray-500">Algunos ingredientes no tienen stock suficiente.</p>
                </div>
              </div>
              
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {missingIngredients.map((item, i) => (
                  <div key={i} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="font-medium text-amber-800">{item.name}</p>
                    <p className="text-sm text-amber-600">
                      Necesitas: {item.needed} {item.unit} · Disponible: {item.available} {item.unit}
                      {item.available > 0 && (
                        <span className="ml-2 text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          Se consumirá lo disponible
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                El costo se calculará solo sobre lo realmente consumido. ¿Deseas producir de todas formas?
              </p>
              
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowOverrideConfirm(false)} disabled={isProducing}>
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  onClick={() => { setShowOverrideConfirm(false); handleProduce(true); }}
                  disabled={isProducing}
                  className="flex items-center gap-2"
                >
                  {isProducing ? <Spinner size="sm" /> : <Utensils size={16} />}
                  Producir de todas formas
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
