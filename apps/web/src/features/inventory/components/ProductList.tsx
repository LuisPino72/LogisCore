import { useState, useMemo } from 'react';
import { Package, Trash2, Plus, AlertTriangle, Edit3 } from 'lucide-react';
import { Button, Badge, DataTable, EmptyState } from '../../../common/components';
import type { Column } from '../../../common/components';
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

function getStockVariant(product: Product): 'success' | 'warning' | 'danger' {
  if (product.stockMin && product.stock <= product.stockMin) return 'danger';
  if (product.stockMin && product.stock <= product.stockMin * 2) return 'warning';
  return 'success';
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

  const columns = useMemo((): Column<Product>[] => {
    const cols: Column<Product>[] = [
      {
        key: 'name',
        header: 'Producto',
        render: (product) => (
          <div className="flex items-center gap-3">
            <Package size={20} className="text-gray-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{product.name}</div>
              <span className="text-[12px]">{product.sku}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'price',
        header: 'Precio',
        render: (product) => (
          <span className="text-xs font-semibold">${product.priceUsd.toFixed(2)}</span>
        ),
      },
      {
        key: 'stock',
        header: 'Total',
        render: (product) => (
          <div className="flex items-center gap-2 key">
            <Badge variant={getStockVariant(product)}>
            {displayStock (product.stock, product.unit)}
            </Badge>
            {product.stockMin && product.stock <= product.stockMin && (
              <AlertTriangle size={12} className="text-danger shrink-0" />
            )}
          </div>
        ),
      },
      {
        key: 'category',
        header: 'Categoría',
        hideOnMobile: true,
        render: (product) => {
          const cat = product.categoryId ? categories.find((c) => c.id === product.categoryId) : undefined;
          return cat ? <span className="text-[12px]">{cat.name}</span> : null;
        },
      },
    ];

    if (isOwner) {
      cols.push({
        key: 'actions',
        header: '',
        className: 'text-right',
        render: (product) => (
          <div className="flex gap-1 items-center justify-end">
            <Button variant="ghost" size="sm" onClick={() => onAdjust(product.id)} className="p-1">
              <Plus size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEditProduct(product)} className="p-1">
              <Edit3 size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onRequestDelete(product.id, product.name)} className="p-1">
              <Trash2 size={14} className="text-danger" />
            </Button>
          </div>
        ),
      });
    }

    return cols;
  }, [isOwner, onAdjust, onEditProduct, onViewHistory, onRequestDelete, categories]);

  if (products.length === 0 && !searchQuery && !filterCategory) {
    return (
      <div className="p-4">
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
      </div>
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
          className="input text-sm w-full sm:max-w-[160px]"
          value={filterCategory}
          onChange={(e) => handleCategoryFilter(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={products}
        keyExtractor={(p: Product) => p.id}
        emptyMessage="No se encontraron productos"
        renderCardOnMobile
      />
    </div>
  );
}
