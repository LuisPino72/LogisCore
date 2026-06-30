import { useState, useEffect } from 'react';
import { ChefHat, Edit3, Trash2, Utensils, Package, AlertTriangle, DollarSign } from 'lucide-react';
import { Card, EmptyState, Button, Badge, Modal, SearchInput, Tooltip } from '../../../common/components';
import { useProductionStore } from '../stores/productionStore';
import { useToastStore } from '../../../stores/toastStore';
import { useAuthStore } from '../../../features/auth/stores/authStore';
import { hasActionPermission } from '../../../features/auth/permissions/rolePermissions';
import { computeRecipeCostAsync } from '../services/costService';
import { getDb } from '@/services/dexie/db';
import { formatUsd } from '@/lib/formatBs';
import type { Recipe } from '../types';

interface RecipeListProps {
  recipes: Recipe[];
  onEdit: (recipe: Recipe) => void;
  onProduce: (recipe: Recipe) => void;
  tenantId: string | null;
}

export function RecipeList({ recipes, onEdit, onProduce, tenantId }: RecipeListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Recipe | null>(null);
  const [recipeCosts, setRecipeCosts] = useState<Map<string, number>>(new Map());
  const { deleteRecipe } = useProductionStore();
  const { addToast } = useToastStore();
  const session = useAuthStore((s) => s.session);
  const canEdit = hasActionPermission(session, 'production', 'update');
  const canDelete = hasActionPermission(session, 'production', 'delete');
  const canProduce = hasActionPermission(session, 'production', 'produce_batch');

  useEffect(() => {
    let cancelled = false;
    const computeAll = async () => {
      const db = getDb();
      const costs = new Map<string, number>();
      for (const recipe of recipes) {
        try {
          const lines = await db.recipeLines
            .where({ recipeId: recipe.id })
            .filter(l => !l.deletedAt)
            .toArray();
          const mappedLines = lines.map(l => ({ productId: l.productId, quantity: l.quantity, unit: l.unit }));
          const yieldQty = recipe.mode === 'batch' ? (recipe.yieldQuantity || 1) : 1;
          const result = await computeRecipeCostAsync(mappedLines, recipe.wastePct || 0, yieldQty);
          if (!cancelled) costs.set(recipe.id, result.totalCost);
        } catch {
          if (!cancelled) costs.set(recipe.id, 0);
        }
      }
      if (!cancelled) setRecipeCosts(costs);
    };
    computeAll();
    return () => { cancelled = true; };
  }, [recipes]);

  const filteredRecipes = recipes.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async () => {
    if (!confirmDelete || !tenantId) {
      if (!tenantId) addToast({ type: 'error', message: 'Sesión no disponible.' });
      return;
    }
    const success = await deleteRecipe(confirmDelete.id, tenantId);
    if (success) {
      addToast({ type: 'success', message: 'Receta eliminada.' });
    } else {
      addToast({ type: 'error', message: 'Error al eliminar la receta.' });
    }
    setConfirmDelete(null);
  };

  if (recipes.length === 0) {
    return (
      <EmptyState
        icon={<ChefHat size={48} className="text-gray-300 icon-float" />}
        title="Sin recetas"
        description="Crea tu primera receta para empezar a producir."
      />
    );
  }

  return (
    <div className="space-y-3">
      <SearchInput
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Buscar recetas..."
        inputMode="search"
      />

      {filteredRecipes.length === 0 ? (
        <EmptyState
          icon={<ChefHat size={48} className="text-gray-300 icon-float" />}
          title="Sin resultados"
          description="No se encontraron recetas con ese nombre."
        />
      ) : (
        <div className="space-y-2 recipe-stagger">
          {filteredRecipes.map((recipe) => (
            <Card key={recipe.id} className={`p-3 sm:p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-l-[3px] ${recipe.mode === 'batch' ? 'border-l-info' : 'border-l-success'}`}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ChefHat size={14} className="text-primary/40 shrink-0" />
                    <h3 className="font-semibold text-sm wrap-break-word">{recipe.name}</h3>
                    <Badge variant={recipe.mode === 'batch' ? 'info' : 'success'} className="shrink-0">
                      {recipe.mode === 'batch' ? (
                        <><Package size={12} className="mr-1" />Lote</>
                      ) : (
                        <><Utensils size={12} className="mr-1" />Ensamblaje</>
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Package size={11} />
                      Rendimiento: {recipe.yieldQuantity} {recipe.yieldUnit}
                    </span>
                    {recipeCosts.get(recipe.id) != null && recipeCosts.get(recipe.id)! > 0 && (
                      <span className="flex items-center gap-1">
                        <DollarSign size={11} />
                        Costo: {formatUsd(recipeCosts.get(recipe.id)!)}
                      </span>
                    )}
                    {recipe.wastePct > 0 && (
                      <span className="inline-flex items-center text-[10px] font-medium bg-warning/10 text-warning px-1.5 py-0.5 rounded-full">Merma {recipe.wastePct}%</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 justify-center sm:justify-end sm:shrink-0">
                  {recipe.mode === 'batch' && canProduce && (
                    <Tooltip content="Producir esta receta" variant="help">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onProduce(recipe)}
                        className="flex items-center gap-1 min-h-[44px]"
                      >
                        <Utensils size={14} />
                        <span className="hidden sm:inline">Producir</span>
                      </Button>
                    </Tooltip>
                  )}
                  {canEdit && (
                    <Tooltip content="Editar receta" variant="help">
                      <Button
                        variant="ghost-primary"
                        size="sm"
                        onClick={() => onEdit(recipe)}
                        className="p-2 min-h-[44px] min-w-[44px]"
                      >
                        <Edit3 size={16} />
                      </Button>
                    </Tooltip>
                  )}
                  {canDelete && (
                    <Tooltip content="Eliminar receta" variant="danger">
                      <Button
                        variant="ghost-danger"
                        size="sm"
                        onClick={() => setConfirmDelete(recipe)}
                        className="p-2 min-h-[44px] min-w-[44px]"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Eliminar Receta">
          <div className="space-y-4 animate-slide-down">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center shrink-0 ring-1 ring-danger/20">
                <AlertTriangle size={24} className="text-danger" />
              </div>
              <div className="pt-1">
                <p className="text-sm font-semibold text-gray-900 wrap-break-word">¿Eliminar receta {confirmDelete.name}?</p>
                <p className="text-xs text-gray-500 mt-1">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setConfirmDelete(null)} className="min-h-[44px]">
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={handleDelete} className="min-h-[44px]">
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
