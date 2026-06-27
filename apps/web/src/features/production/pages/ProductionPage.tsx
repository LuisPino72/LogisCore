import React, { useState, useMemo } from 'react';
import { ChefHat, Plus, History, Utensils, Package, AlertTriangle, Flame } from 'lucide-react';
import { Button, Card, EmptyState, BottomNav, Spinner, ModuleOnboarding, Modal } from '../../../common/components';
import { useToastStore } from '../../../stores/toastStore';
import { useProduction } from '../hooks/useProduction';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import { RecipeList } from '../components/RecipeList';
import { RecipeForm } from '../components/RecipeForm';
import { ProduceModal } from '../components/ProduceModal';
import { ProductionHistory } from '../components/ProductionHistory';
import type { Recipe } from '../types';
import type { BottomNavItem } from '../../../common/components';

const KitchenDisplay = React.lazy(() => import('../components/KitchenDisplay'));

interface ProductionPageProps {
  tenantId: string | null;
}

export function ProductionPage({ tenantId }: ProductionPageProps) {
  const {
    recipes, productionOrders, loading,
    activeTab, setActiveTab,
    userId,
    cancelOrder,
  } = useProduction(tenantId);
  const { pendingCount: pendingKitchenCount } = useKitchenOrders();
  const { addToast } = useToastStore();

  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [showProduceModal, setShowProduceModal] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  // PLAN-115 (CODE-MIN-7): estado para confirmacion de cancelacion de orden
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<{ orderId: string; recipeName: string } | null>(null);

  const bottomNavItems: BottomNavItem[] = useMemo(() => [
    { id: 'recipes', label: 'Recetas', icon: <ChefHat size={20} />, onClick: () => setActiveTab('recipes') },
    { id: 'produce', label: 'Producir', icon: <Utensils size={20} />, onClick: () => setActiveTab('produce') },
    { id: 'kitchen', label: 'Cocina', icon: <Flame size={20} />, onClick: () => setActiveTab('kitchen'), badge: pendingKitchenCount > 0 ? pendingKitchenCount : undefined },
    { id: 'history', label: 'Historial', icon: <History size={20} />, onClick: () => setActiveTab('history') },
  ], [setActiveTab, pendingKitchenCount]);

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

  // PLAN-115 (CODE-MIN-7): handler para cancelar orden desde historial.
  // Solo orders en 'confirmed' son cancelables (createOrder las crea asi y
  // cancelOrder rechaza cualquier otro status con ORDER_INVALID_STATUS).
  const handleCancelOrder = async (orderId: string) => {
    if (!tenantId) {
      addToast({ type: 'error', message: 'Sesión no disponible.' });
      return;
    }
    setCancellingOrderId(orderId);
    try {
      const success = await cancelOrder(orderId, tenantId);
      if (!success) {
        // El store ya setea el error; el componente UI lo muestra via fetchOrders/error
      }
    } finally {
      setCancellingOrderId(null);
      setCancelConfirm(null);
    }
  };

  const requestCancelOrder = (orderId: string) => {
    const order = productionOrders.find((o) => o.id === orderId);
    const recipeName = order ? (recipes.find((r) => r.id === order.recipeId)?.name ?? 'Orden') : 'Orden';
    setCancelConfirm({ orderId, recipeName });
  };

  const activeRecipes = recipes.filter((r) => r.isActive).length;
  const batchRecipes = recipes.filter((r) => r.isActive && r.mode === 'batch').length;
  const completedOrders = productionOrders.filter((o) => o.status === 'done').length;

  return (
    <div className="p-3 sm:p-6 pb-24 sm:pb-0 max-w-6xl mx-auto space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-linear-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
            <ChefHat size={18} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-title font-bold truncate" style={{ fontSize: 'var(--text-fluid-xl)' }}>Producción</h1>
            <p className="text-xs text-text-secondary hidden sm:block">Recetas, producción e historial</p>
          </div>
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

      {/* Desktop tabs */}
      <div className="hidden sm:flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/60 p-1 sticky top-0 z-10 shadow-sm">
        {bottomNavItems.map((tab) => (
          <button
            key={tab.id}
            onClick={tab.onClick}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'recipes' && activeRecipes > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center ${
                activeTab === tab.id ? 'bg-white/25 text-white' : 'bg-primary/10 text-primary'
              }`}>
                {activeRecipes}
              </span>
            )}
            {tab.id === 'produce' && batchRecipes > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center ${
                activeTab === tab.id ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'
              }`}>
                {batchRecipes}
              </span>
            )}
            {tab.id === 'kitchen' && pendingKitchenCount > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center ${
                activeTab === tab.id ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'
              }`}>
                {pendingKitchenCount}
              </span>
            )}
            {tab.id === 'history' && completedOrders > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center ${
                activeTab === tab.id ? 'bg-white/25 text-white' : 'bg-green-100 text-green-700'
              }`}>
                {completedOrders}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Quick stats bar - desktop only */}
      {activeTab === 'recipes' && recipes.length > 0 && (
        <div className="hidden sm:flex items-center gap-3 text-xs">
          {activeRecipes > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 border border-primary/15">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-primary font-medium">{activeRecipes} receta{activeRecipes !== 1 ? 's' : ''} activa{activeRecipes !== 1 ? 's' : ''}</span>
            </div>
          )}
          {recipes.length - activeRecipes > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              <span className="text-gray-600 font-medium">{recipes.length - activeRecipes} inactiva{recipes.length - activeRecipes !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

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
                  icon={<Utensils size={48} className="text-gray-300 icon-float" />}
                  title="Sin recetas activas"
                  description="Crea recetas de producción por lotes para poder producir."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 recipe-stagger">
                  {recipes
                    .filter((r) => r.mode === 'batch' && r.isActive)
                    .map((recipe) => (
                      <Card key={recipe.id} className="p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                        <div className="flex items-start justify-between mb-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-sm wrap-break-word">{recipe.name}</h3>
                            <p className="text-xs text-gray-500 wrap-break-word">
                              Rendimiento: {recipe.yieldQuantity} {recipe.yieldUnit}
                            </p>
                          </div>
                          {recipe.wastePct > 0 && (
                            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200/60 px-2 py-0.5 rounded-full shrink-0 ml-2">
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
          {activeTab === 'kitchen' && (
            <React.Suspense fallback={<div className="flex justify-center py-8"><Spinner /></div>}>
              <KitchenDisplay />
            </React.Suspense>
          )}
          {activeTab === 'history' && (
            <ProductionHistory
              orders={productionOrders}
              recipes={recipes}
              onCancel={requestCancelOrder}
              cancellingOrderId={cancellingOrderId}
              tenantId={tenantId || ''}
            />
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

      <ModuleOnboarding
        moduleId="production"
        steps={[
          {
            title: 'Crea tus Recetas',
            description: 'Define los ingredientes y cantidades necesarias para producir cada producto. Puedes elegir entre producción por lotes o ensamblaje.',
            icon: <ChefHat size={24} className="text-white" />,
          },
          {
            title: 'Produce con Un Toque',
            description: 'Selecciona una receta, indica cuántos lotes quieres hacer y el sistema descuenta los ingredientes automáticamente.',
            icon: <Utensils size={24} className="text-white" />,
          },
          {
            title: 'Control de Stock',
            description: 'El producto terminado se agrega a tu inventario listo para vender. Los ingredientes se descuentan con trazabilidad FIFO.',
            icon: <Package size={24} className="text-white" />,
          },
        ]}
        onComplete={() => {}}
      />

      {/* Confirmar cancelación de orden */}
      {cancelConfirm && (
        <Modal
          isOpen={!!cancelConfirm}
          onClose={() => setCancelConfirm(null)}
          title="Cancelar orden"
          footer={
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCancelConfirm(null)}
                disabled={cancellingOrderId === cancelConfirm.orderId}
              >
                Volver
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleCancelOrder(cancelConfirm.orderId)}
                disabled={cancellingOrderId === cancelConfirm.orderId}
              >
                {cancellingOrderId === cancelConfirm.orderId ? 'Cancelando...' : 'Sí, cancelar'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 animate-slide-down">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center shrink-0 ring-1 ring-danger/20">
                <AlertTriangle size={24} className="text-danger" />
              </div>
              <div className="pt-1">
                <p className="text-sm font-semibold text-gray-900">¿Cancelar orden de {cancelConfirm.recipeName}?</p>
                <p className="text-xs text-gray-500 mt-1">El stock de ingredientes se revertirá automáticamente.</p>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
