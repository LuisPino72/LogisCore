import { useState } from 'react';
import { SearchInput, EmptyState, Skeleton, Badge, Modal, Button } from '../../../common/components';
import { Package, ListTree } from 'lucide-react';
import { ProductCard } from './ProductCard';
import type { Product } from '../../../specs/inventory';
import type { Category } from '../../../specs/inventory';

const VISIBLE_CATEGORIES = 6;

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  selectedCategory: string | null;
  onCategoryChange: (id: string | null) => void;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddToCart: (product: Product) => void;
  onToggleFavorite: (productId: string) => void;
  favoriteIds: Set<string>;
  exchangeRateBs: number;
}

export function ProductGrid({
  products,
  categories,
  selectedCategory,
  onCategoryChange,
  loading,
  searchQuery,
  onSearchChange,
  onAddToCart,
  onToggleFavorite,
  favoriteIds,
  exchangeRateBs,
}: ProductGridProps) {
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  let filtered = searchQuery
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.sku.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : products;

  if (selectedCategory) {
    filtered = filtered.filter((p) => p.categoryId === selectedCategory);
  }

  const visibleCategories = categories.slice(0, VISIBLE_CATEGORIES);
  const hasMoreCategories = categories.length > VISIBLE_CATEGORIES;

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      <SearchInput
        placeholder="Buscar producto..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onClear={() => onSearchChange('')}
      />

      {categories.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button type="button" onClick={() => onCategoryChange(null)} className="shrink-0 min-h-11 px-1 flex items-center">
              <Badge variant={selectedCategory === null ? 'info' : 'neutral'}>Todos</Badge>
            </button>
            {visibleCategories.map((cat) => (
              <button key={cat.id} type="button" onClick={() => onCategoryChange(cat.id)} className="shrink-0 min-h-11 px-1 flex items-center">
                <Badge variant={selectedCategory === cat.id ? 'info' : 'neutral'}>{cat.name}</Badge>
              </button>
            ))}
            {hasMoreCategories && (
              <button
                type="button"
                onClick={() => setShowAllCategories(true)}
                className="shrink-0 min-h-11 flex items-center gap-1 px-2 rounded-full bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors"
              >
                <ListTree size={12} />
                +{categories.length - VISIBLE_CATEGORIES}
              </button>
            )}
          </div>

          <Modal
            isOpen={showAllCategories}
            onClose={() => { setShowAllCategories(false); setCategorySearch(''); }}
            title="Todas las categorías"
            size="sm"
          >
            <div className="space-y-3">
              <SearchInput
                placeholder="Buscar categoría..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                onClear={() => setCategorySearch('')}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { onCategoryChange(null); setShowAllCategories(false); setCategorySearch(''); }}
                  className="shrink-0"
                >
                  <Badge variant={selectedCategory === null ? 'info' : 'neutral'}>Todos</Badge>
                </button>
                {categories
                  .filter((cat) => cat.name.toLowerCase().includes(categorySearch.toLowerCase()))
                  .map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => { onCategoryChange(cat.id); setShowAllCategories(false); setCategorySearch(''); }}
                      className="shrink-0"
                    >
                      <Badge variant={selectedCategory === cat.id ? 'info' : 'neutral'}>{cat.name}</Badge>
                    </button>
                  ))}
                {categories.filter((cat) => cat.name.toLowerCase().includes(categorySearch.toLowerCase())).length === 0 && (
                  <div className="w-full text-center text-sm text-gray-400 py-4">
                    No se encontraron categorías
                  </div>
                )}
              </div>
            </div>
          </Modal>
        </>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="shimmer" className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package size={40} />}
          title="Sin productos"
          description={searchQuery || selectedCategory ? 'No se encontraron resultados.' : 'Agrega productos desde el módulo de Inventario.'}
          action={!searchQuery && !selectedCategory ? (
            <Button variant="primary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { module: 'inventory' } }))}>
              Ir a Inventario
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 overflow-y-auto flex-1 pb-16 md:pb-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAdd={onAddToCart}
              onToggleFavorite={onToggleFavorite}
              isFavorite={favoriteIds.has(product.id)}
              exchangeRateBs={exchangeRateBs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
