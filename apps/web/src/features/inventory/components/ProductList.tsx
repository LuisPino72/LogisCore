import { useState, useMemo } from 'react';
import { Package, Trash2, Plus, AlertTriangle, Edit3, Layers, ClipboardList, MoreVertical } from 'lucide-react';
import { Button, Badge, DataTable, Dropdown, EmptyState, Select, ImageWithFallback } from '../../../common/components';
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
  onViewLots: (productId: string) => void;
  onViewKardex: (productId: string) => void;
  onRefresh: () => void;
}

function getStockLabel(product: Product): string {
  if (product.isWeighted) return product.unit === 'lt' ? 'Lt' : 'Kg';
  return 'Total';
}

function getStockBadgeContent(product: Product): string {
  const display = displayStock(product.stock, product.unit);
  const label = getStockLabel(product);
  return `${display} ${label}`;
}

function getStockVariant(product: Product): 'success' | 'warning' | 'danger' {
  if (product.stockMin && product.stock <= product.stockMin) return 'danger';
  if (product.stockMin && product.stock <= product.stockMin * 2) return 'warning';
  return 'success';
}

export function ProductList({ products, categories, onSearch, isOwner, onNewProduct, onEditProduct, onRequestDelete, onAdjust, onViewLots, onViewKardex }: ProductListProps) {
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
          <div className="flex flex-col items-center text-center gap-2">
            <div className="relative w-full aspect-4/3 rounded-lg overflow-hidden bg-gray-100">
              <ImageWithFallback
                productId={product.id}
                imageUrl={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover"
                skeletonClassName="rounded-lg"
              />
              {isOwner && (
                <div className="absolute top-1 right-1 z-20">
                  <Dropdown
                    align="right"
                    trigger={<MoreVertical size={20} className="text-gray-500 drop-shadow-md" />}
                    items={[
                      { label: 'Ver lotes', icon: <Layers size={16} />, onClick: () => onViewLots(product.id) },
                      { label: 'Ver Kardex', icon: <ClipboardList size={16} />, onClick: () => onViewKardex(product.id) },
                      { label: 'Ajustar stock', icon: <Plus size={16} />, onClick: () => onAdjust(product.id) },
                    ]}
                  />
                </div>
              )}
            </div>
            <div className="sm:hidden w-full space-y-1">
              <div className="font-medium text-sm">{product.name}</div>
              <span className="text-[12px] text-gray-500">{product.sku}</span>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-semibold">${product.priceUsd.toFixed(2)}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={getStockVariant(product)}>
                    {getStockBadgeContent(product)}
                  </Badge>
                  {product.stockMin && product.stock <= product.stockMin && (
                    <AlertTriangle size={12} className="text-danger shrink-0" />
                  )}
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        key: 'sku',
        header: 'SKU',
        hideOnMobile: true,
        render: (product) => (
          <span className="text-[12px] text-gray-500 font-mono">{product.sku}</span>
        ),
      },
      {
        key: 'price',
        header: 'Precio',
        hideOnMobile: true,
        render: (product) => (
          <span className="text-xs font-semibold">${product.priceUsd.toFixed(2)}</span>
        ),
      },
      {
        key: 'stock',
        header: 'Total',
        hideOnMobile: true,
        render: (product) => (
          <div className="flex items-center gap-2">
            <Badge variant={getStockVariant(product)}>
              {getStockBadgeContent(product)}
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
        hideOnMobile: true,
        className: 'text-right',
        render: (product) => (
          <div className="flex items-center gap-0.5 justify-end flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => onEditProduct(product)} className="p-1" title="Editar">
              <Edit3 size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onRequestDelete(product.id, product.name)} className="p-1" title="Eliminar">
              <Trash2 size={16} className="text-danger" />
            </Button>
          </div>
        ),
      });
    }

    return cols;
  }, [isOwner, onAdjust, onEditProduct, onRequestDelete, categories, onViewKardex, onViewLots]);

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
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <ProductSearchInput value={searchQuery} onChange={handleSearch} />
        </div>
        <div className="w-full sm:max-w-[180px]">
          <Select
            value={filterCategory}
            onChange={(e) => handleCategoryFilter(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </Select>
        </div>
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
