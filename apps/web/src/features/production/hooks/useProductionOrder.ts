import { useState, useCallback } from 'react';
import type { Recipe, IngredientAvailability } from '../types';
import { useProductionStore } from '../stores/productionStore';

interface ProduceModalState {
  recipe: Recipe | null;
  batchCount: number;
  ingredientAvailability: IngredientAvailability[];
  estimatedCost: number;
  isChecking: boolean;
  isProducing: boolean;
  error: string | null;
}

const INITIAL_STATE: ProduceModalState = {
  recipe: null,
  batchCount: 1,
  ingredientAvailability: [],
  estimatedCost: 0,
  isChecking: false,
  isProducing: false,
  error: null,
};

export function useProductionOrder() {
  const [state, setState] = useState<ProduceModalState>(INITIAL_STATE);
  const { checkIngredientsAvailability, calculateRecipeCost, createOrder } = useProductionStore();

  const openModal = useCallback((recipe: Recipe) => {
    setState({
      ...INITIAL_STATE,
      recipe,
      batchCount: 1,
    });
  }, []);

  const closeModal = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const setBatchCount = useCallback(async (count: number) => {
    const recipe = state.recipe;
    if (!recipe || count <= 0) return;

    setState((prev) => ({ ...prev, batchCount: count, isChecking: true, error: null }));

    try {
      const [availability, cost] = await Promise.all([
        checkIngredientsAvailability(recipe.id, count),
        calculateRecipeCost(recipe.id, count),
      ]);

      setState((prev) => ({
        ...prev,
        batchCount: count,
        ingredientAvailability: availability,
        estimatedCost: cost,
        isChecking: false,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        isChecking: false,
        error: 'Error al verificar disponibilidad.',
      }));
    }
  }, [state.recipe, checkIngredientsAvailability, calculateRecipeCost]);

  const allIngredientsAvailable = state.ingredientAvailability.every((i) => i.sufficient);

  const produce = useCallback(async (tenantId: string, userId: string): Promise<boolean> => {
    const recipe = state.recipe;
    if (!recipe || !allIngredientsAvailable) return false;

    setState((prev) => ({ ...prev, isProducing: true, error: null }));

    const result = await createOrder(tenantId, userId, {
      recipeId: recipe.id,
      batchCount: state.batchCount,
    });

    if (result) {
      setState(INITIAL_STATE);
      return true;
    }

    setState((prev) => ({
      ...prev,
      isProducing: false,
      error: 'Error al producir. Verifica el stock de ingredientes.',
    }));
    return false;
  }, [state.recipe, state.batchCount, allIngredientsAvailable, createOrder]);

  return {
    ...state,
    openModal,
    closeModal,
    setBatchCount,
    produce,
    allIngredientsAvailable,
  };
}
