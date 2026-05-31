import { useState } from 'react';
import { ChefHat, Edit3, Trash2, Utensils, Package } from 'lucide-react';
import { Card, EmptyState, Button, Badge, Modal, SearchInput } from '../../../common/components';
import { useProductionStore } from '../stores/productionStore';
import { useToastStore } from '../../../stores/toastStore';
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
  const { deleteRecipe } = useProductionStore();
  const { addToast } = useToastStore();

  const filteredRecipes = recipes.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async () => {
    if (!confirmDelete || !tenantId) return;
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
        icon={<ChefHat size={48} className="text-gray-300" />}
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
      />

      {filteredRecipes.length === 0 ? (
        <EmptyState
          icon={<ChefHat size={48} className="text-gray-300" />}
          title="Sin resultados"
          description="No se encontraron recetas con ese nombre."
        />
      ) : (
        <div className="space-y-2">
          {filteredRecipes.map((recipe) => (
            <Card key={recipe.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm truncate">{recipe.name}</h3>
                    <Badge variant={recipe.mode === 'batch' ? 'info' : 'success'} className="shrink-0">
                      {recipe.mode === 'batch' ? (
                        <><Package size={12} className="mr-1" />Lote</>
                      ) : (
                        <><Utensils size={12} className="mr-1" />Ensamblaje</>
                      )}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    Yield: {recipe.yieldQuantity} {recipe.yieldUnit}
                    {recipe.wastePct > 0 && (
                      <span className="ml-2 text-warning">· Merma: {recipe.wastePct}%</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {recipe.mode === 'batch' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onProduce(recipe)}
                      className="flex items-center gap-1"
                    >
                      <Utensils size={14} />
                      <span className="hidden sm:inline">Producir</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(recipe)}
                    className="p-2"
                  >
                    <Edit3 size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(recipe)}
                    className="p-2 text-danger hover:text-danger"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Eliminar Receta">
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-4">
              ¿Estás seguro de eliminar la receta <strong>{confirmDelete.name}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
