import { SearchInput, EmptyState, Skeleton, Badge } from '../../../common/components';
import { Package } from 'lucide-react';
import { ProductCard } from './ProductCard';
import type { Product } from '../../../specs/inventory';
import type { Category } from '../../../specs/inventory';

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

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      <SearchInput
        placeholder="Buscar producto..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onClear={() => onSearchChange('')}
      />

      {categories.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button type="button" onClick={() => onCategoryChange(null)}>
            <Badge variant={selectedCategory === null ? 'info' : 'neutral'}>Todos</Badge>
          </button>
          {categories.map((cat) => (
            <button key={cat.id} type="button" onClick={() => onCategoryChange(cat.id)}>
              <Badge variant={selectedCategory === cat.id ? 'info' : 'neutral'}>{cat.name}</Badge>
            </button>
          ))}
        </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 overflow-y-auto flex-1 pb-20 md:pb-4">
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
