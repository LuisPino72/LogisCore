import { useState, useEffect, memo } from 'react';
import { SearchInput, EmptyState, Skeleton, Modal, Button, Pagination } from '../../../common/components';
import { Package, ListTree } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { useFuzzySearch } from '@/lib/useFuzzySearch';
import type { Product } from '../../../specs/inventory';
import type { Category } from '../../../specs/inventory';
import type { UserRole } from '@logiscore/core';

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
  role?: UserRole | null;
  onReorder?: (product: Product) => void;
}

const PAGE_SIZE = 20;

export const ProductGrid = memo(function ProductGrid({
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
  role,
  onReorder,
}: ProductGridProps) {
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory]);

  const fuzzyResults = useFuzzySearch(products, searchQuery, {
    keys: ['name', 'sku'],
    threshold: 0.4,
    minMatchCharLength: 2,
  });

  const filteredCategories = useFuzzySearch(categories, categorySearch, { keys: ['name'] });

  let filtered = searchQuery
    ? fuzzyResults.filter((p) => p.stock > 0 || p.hasAssemblyRecipe)
    : products.filter((p) => p.stock > 0 || p.hasAssemblyRecipe);

  if (selectedCategory) {
    filtered = filtered.filter((p) => p.categoryId === selectedCategory);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedProducts = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const visibleCategories = categories.slice(0, VISIBLE_CATEGORIES);
  const hasMoreCategories = categories.length > VISIBLE_CATEGORIES;

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      <SearchInput
        placeholder="Buscar producto..."
        maxLength={20}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onClear={() => onSearchChange('')}
      />

      {categories.length > 0 && (
        <>
          <div className="scroll-fade-mask">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={(e) => { onCategoryChange(null); e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }}
                className={`shrink-0 px-3 py-1.5 min-h-11 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                  selectedCategory === null
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white text-text-secondary border-border hover:border-primary/30 hover:text-primary'
                }`}
              >
                Todos
              </button>
              {visibleCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={(e) => { onCategoryChange(cat.id); e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }}
                  className={`shrink-0 px-3 py-1.5 min-h-11 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                    selectedCategory === cat.id
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white text-text-secondary border-border hover:border-primary/30 hover:text-primary'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
              {hasMoreCategories && (
                <button
                  type="button"
                  onClick={() => setShowAllCategories(true)}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 min-h-11 rounded-full text-xs font-medium border border-border bg-white text-text-secondary hover:border-primary/30 hover:text-primary transition-all"
                >
                  <ListTree size={12} />
                  +{categories.length - VISIBLE_CATEGORIES}
                </button>
              )}
            </div>
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
                maxLength={20}
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                onClear={() => setCategorySearch('')}
              />
              <div className="flex flex-wrap gap-2">
                {(() => {
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => { onCategoryChange(null); setShowAllCategories(false); setCategorySearch(''); }}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          selectedCategory === null
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-white text-text-secondary border-border hover:border-primary/30 hover:text-primary'
                        }`}
                      >
                        Todos
                      </button>
                      {filteredCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => { onCategoryChange(cat.id); setShowAllCategories(false); setCategorySearch(''); }}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            selectedCategory === cat.id
                              ? 'bg-primary text-white border-primary shadow-sm'
                              : 'bg-white text-text-secondary border-border hover:border-primary/30 hover:text-primary'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                      {filtered.length === 0 && (
                        <div className="w-full text-center text-sm text-gray-600 py-4">
                          No se encontraron categorías
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </Modal>
        </>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="shimmer" className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package size={40} />}
          title={searchQuery || selectedCategory ? 'Sin resultados' : 'Aún no hay productos'}
          description={searchQuery || selectedCategory ? 'No encontramos productos con ese nombre o categoría.' : role === 'employee' ? 'No hay productos disponibles para la venta.' : 'Agrega productos desde el módulo de Inventario para empezar a vender.'}
          action={!searchQuery && !selectedCategory && role !== 'employee' ? (
            <Button variant="primary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { module: 'inventory' } }))}>
              Ir a Inventario
            </Button>
          ) : undefined}
        />
      ) : (
        <>
          <div key={`${selectedCategory ?? 'all'}-${searchQuery}`} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto flex-1 pb-16 md:pb-4 animate-fade-in">
            {pagedProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                onAdd={onAddToCart}
                onToggleFavorite={onToggleFavorite}
                isFavorite={favoriteIds.has(product.id)}
                exchangeRateBs={exchangeRateBs}
                onReorder={onReorder}
                hasAssemblyRecipe={product.hasAssemblyRecipe}
                index={index}
              />
            ))}
          </div>
          <div className="pb-24 md:pb-0 pr-16 md:pr-0">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
});
