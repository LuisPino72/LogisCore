import { useState, useMemo } from 'react';
import { ChefHat, Plus, History, Utensils } from 'lucide-react';
import { Button, Card, EmptyState, BottomNav, Spinner } from '../../../common/components';
import { useProduction } from '../hooks/useProduction';
import { RecipeList } from '../components/RecipeList';
import { RecipeForm } from '../components/RecipeForm';
import { ProduceModal } from '../components/ProduceModal';
import { ProductionHistory } from '../components/ProductionHistory';
import type { Recipe } from '../types';
import type { BottomNavItem } from '../../../common/components';

interface ProductionPageProps {
  tenantId: string | null;
}

export function ProductionPage({ tenantId }: ProductionPageProps) {
  const {
    recipes, productionOrders, loading,
    activeTab, setActiveTab,
    userId,
  } = useProduction(tenantId);

  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [showProduceModal, setShowProduceModal] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  const bottomNavItems: BottomNavItem[] = useMemo(() => [
    { id: 'recipes', label: 'Recetas', icon: <ChefHat size={20} />, onClick: () => setActiveTab('recipes') },
    { id: 'produce', label: 'Producir', icon: <Utensils size={20} />, onClick: () => setActiveTab('produce') },
    { id: 'history', label: 'Historial', icon: <History size={20} />, onClick: () => setActiveTab('history') },
  ], [setActiveTab]);

  const handleCreateRecipe = () => {
    setEditRecipe(null);
    setShowRecipeForm(true);
  };

  const handleEditRecipe = (recipe: Recipe) => {
    setEditRecipe(recipe);
    setShowRecipeForm(true);
  };

  const handleProduce = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setShowProduceModal(true);
  };

  const handleRecipeFormClose = () => {
    setShowRecipeForm(false);
    setEditRecipe(null);
  };

  const handleProduceModalClose = () => {
    setShowProduceModal(false);
    setSelectedRecipe(null);
  };

  return (
    <div className="animate-fade-in pb-20 sm:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ChefHat size={24} className="text-primary" />
          <h1 className="text-xl font-title font-bold">Producción</h1>
        </div>
        {activeTab === 'recipes' && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreateRecipe}
            className="flex items-center gap-1"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nueva Receta</span>
          </Button>
        )}
      </div>

      {/* Content */}
      {loading && recipes.length === 0 ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {activeTab === 'recipes' && (
            <RecipeList
              recipes={recipes}
              onEdit={handleEditRecipe}
              onProduce={handleProduce}
              tenantId={tenantId}
            />
          )}
          {activeTab === 'produce' && (
            <div className="space-y-4">
              {recipes.filter((r) => r.mode === 'batch' && r.isActive).length === 0 ? (
                <EmptyState
                  icon={<Utensils size={48} className="text-gray-300" />}
                  title="Sin recetas activas"
                  description="Crea recetas de producción por lotes para poder producir."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recipes
                    .filter((r) => r.mode === 'batch' && r.isActive)
                    .map((recipe) => (
                      <Card key={recipe.id} className="p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-sm">{recipe.name}</h3>
                            <p className="text-xs text-gray-500">
                              Yield: {recipe.yieldQuantity} {recipe.yieldUnit}
                            </p>
                          </div>
                          {recipe.wastePct > 0 && (
                            <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full">
                              -{recipe.wastePct}% merma
                            </span>
                          )}
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          fullWidth
                          onClick={() => handleProduce(recipe)}
                        >
                          Producir
                        </Button>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          )}
          {activeTab === 'history' && (
            <ProductionHistory orders={productionOrders} recipes={recipes} />
          )}
        </>
      )}

      {/* Bottom Nav (mobile) */}
      <BottomNav
        items={bottomNavItems}
        activeId={activeTab}
        className="sm:hidden fixed bottom-0 left-0 right-0"
      />

      {/* Modals */}
      {showRecipeForm && (
        <RecipeForm
          recipe={editRecipe}
          tenantId={tenantId}
          userId={userId}
          onClose={handleRecipeFormClose}
        />
      )}

      {showProduceModal && selectedRecipe && (
        <ProduceModal
          recipe={selectedRecipe}
          tenantId={tenantId}
          userId={userId}
          onClose={handleProduceModalClose}
        />
      )}
    </div>
  );
}
