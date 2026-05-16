import { useState } from 'react';
import { SearchInput, EmptyState, Skeleton, Badge, Modal } from '../../../common/components';
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
            <button type="button" onClick={() => onCategoryChange(null)} className="shrink-0">
              <Badge variant={selectedCategory === null ? 'info' : 'neutral'}>Todos</Badge>
            </button>
            {visibleCategories.map((cat) => (
              <button key={cat.id} type="button" onClick={() => onCategoryChange(cat.id)} className="shrink-0">
                <Badge variant={selectedCategory === cat.id ? 'info' : 'neutral'}>{cat.name}</Badge>
              </button>
            ))}
            {hasMoreCategories && (
              <button
                type="button"
                onClick={() => setShowAllCategories(true)}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors"
              >
                <ListTree size={12} />
                +{categories.length - VISIBLE_CATEGORIES}
              </button>
            )}
          </div>

          <Modal
            isOpen={showAllCategories}
            onClose={() => setShowAllCategories(false)}
            title="Todas las categorías"
            size="sm"
          >
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { onCategoryChange(null); setShowAllCategories(false); }}
                className="shrink-0"
              >
                <Badge variant={selectedCategory === null ? 'info' : 'neutral'}>Todos</Badge>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => { onCategoryChange(cat.id); setShowAllCategories(false); }}
                  className="shrink-0"
                >
                  <Badge variant={selectedCategory === cat.id ? 'info' : 'neutral'}>{cat.name}</Badge>
                </button>
              ))}
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
