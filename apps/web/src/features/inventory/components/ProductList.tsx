import { useState } from 'react';
import { Package, Trash2, Plus, ClipboardList, AlertTriangle, Edit3 } from 'lucide-react';
import { Button, Badge, EmptyState } from '../../../common/components';
import { ProductSearchInput } from './ProductSearchInput';
import type { Product, Category } from '../types';
import { displayStock } from '../types';

interface ProductListProps {
  products: Product[];
  categories: Category[];
  onSearch: (query: string, categoryId?: string) => void;
  isOwner: boolean;
  onNewProduct: () => void;
  onEditProduct: (product: Product) => void;
  onRequestDelete: (id: string, name: string) => void;
  onAdjust: (id: string) => void;
  onViewHistory: (id: string) => void;
  onRefresh: () => void;
}

export function ProductList({ products, categories, onSearch, isOwner, onNewProduct, onEditProduct, onRequestDelete, onAdjust, onViewHistory }: ProductListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch(value, filterCategory || undefined);
  };

  const handleCategoryFilter = (categoryId: string) => {
    setFilterCategory(categoryId);
    onSearch(searchQuery, categoryId || undefined);
  };

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const getStockVariant = (product: Product): 'success' | 'warning' | 'danger' => {
    if (product.stockMin && product.stock <= product.stockMin) return 'danger';
    if (product.stockMin && product.stock <= product.stockMin * 2) return 'warning';
    return 'success';
  };

  if (products.length === 0 && !searchQuery && !filterCategory) {
    return (
      <EmptyState
        icon={<Package size={40} />}
        title="Sin productos"
        description="Agrega tu primer producto para comenzar"
        action={
          isOwner ? (
            <Button variant="primary" size="sm" onClick={onNewProduct}>
              <Plus size={16} /> Nuevo producto
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3 p-4">
      {isOwner && (
        <Button variant="primary" size="sm" onClick={onNewProduct}>
          <Plus size={16} /> Nuevo producto
        </Button>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <ProductSearchInput value={searchQuery} onChange={handleSearch} />
        </div>
          <select
            className="input text-sm max-w-[130px] sm:max-w-[160px] shrink-0"
            value={filterCategory}
            onChange={(e) => handleCategoryFilter(e.target.value)}
          >
          <option value="">Todas las categorías</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {products.map((product) => (
        <div key={product.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-100">
          <Package size={20} className="text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{product.name}</span>
              <span className="hidden sm:inline text-[10px] text-gray-400 shrink-0">{product.sku}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-semibold">${product.priceUsd.toFixed(2)}</span>
              <Badge variant={getStockVariant(product)}>
                {displayStock(product.stock, product.unit)} {product.unit}
              </Badge>
              {product.stockMin && product.stock <= product.stockMin && (
                <AlertTriangle size={12} className="text-danger" />
              )}
              <span className="hidden sm:inline text-[10px] text-gray-400">
                {product.isWeighted ? 'Pesable' : 'Unidad'}
                <span className="hidden sm:inline">
                  {product.categoryId && categoryMap.has(product.categoryId) && ` · ${categoryMap.get(product.categoryId)}`}
                </span>
              </span>
            </div>
          </div>
          {isOwner && (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => onAdjust(product.id)}>
                <Plus size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onEditProduct(product)}>
                <Edit3 size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onViewHistory(product.id)}>
                <ClipboardList size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRequestDelete(product.id, product.name)}
              >
                <Trash2 size={14} className="text-danger" />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
