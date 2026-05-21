import { useState, useMemo, useEffect } from 'react';
import { Package, Trash2, Plus, AlertTriangle, Edit3, Layers, ClipboardList, MoreVertical } from 'lucide-react';
import { Button, Badge, DataTable, Dropdown, EmptyState, Select, ImageWithFallback } from '../../../common/components';
import type { Column } from '../../../common/components';
import { ProductSearchInput } from './ProductSearchInput';
import type { Product, Category } from '../types';
import { displayStock } from '../types';
import { formatUsd } from '@/lib/formatBs';

interface ProductListProps {
  products: Product[];
  categories: Category[];
  onSearch: (query: string, categoryId?: string) => void;
  isOwner: boolean;
  totalLowStock?: number;
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

export function ProductList({ products, categories, onSearch, isOwner, totalLowStock = 0, onNewProduct, onEditProduct, onRequestDelete, onAdjust, onViewLots, onViewKardex }: ProductListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterCategory]);

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
        key: 'image',
        header: '',
        hideOnMobile: true,
        render: (product) => (
          <ImageWithFallback
            productId={product.id}
            imageUrl={product.imageUrl}
            alt={product.name}
            className="shrink-0 rounded-lg object-cover w-full h-full md:w-20 md:h-20"
            skeletonClassName="rounded-lg"
          />
        ),
      },
      {
        key: 'name',
        header: 'Producto',
        render: (product) => (
          <div>
            <div className="font-medium text-gray-900">{product.name}</div>
            <div className="text-[10px] text-text-secondary font-mono">{product.sku}</div>
          </div>
        ),
      },
      {
        key: 'price',
        header: 'Precio',
        hideLabelOnMobile: true,
        render: (product) => (
          <span className="text-xs font-semibold">{formatUsd(product.priceUsd)}</span>
        ),
      },
      {
        key: 'stock',
        header: 'Total',
        hideLabelOnMobile: true,
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
        header: 'Acciones',
        className: 'text-right',
        render: (product) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button variant="ghost" size="sm" onClick={() => onEditProduct(product)} className="p-1.5" title="Editar">
              <Edit3 size={15} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onRequestDelete(product.id, product.name)} className="p-1.5" title="Eliminar">
              <Trash2 size={15} className="text-danger" />
            </Button>
            <Dropdown
              align="right"
              trigger={
                <div className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
                  <MoreVertical size={15} className="text-gray-600" />
                </div>
              }
              items={[
                { label: 'Lotes', icon: <Layers size={15} />, onClick: () => onViewLots(product.id) },
                { label: 'Kardex', icon: <ClipboardList size={15} />, onClick: () => onViewKardex(product.id) },
                { label: 'Ajustar', icon: <Plus size={15} />, onClick: () => onAdjust(product.id) },
              ]}
            />
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
    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <ProductSearchInput value={searchQuery} onChange={handleSearch} />
        </div>
        <div className="w-full sm:max-w-45">
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

      {products.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-text-secondary">{products.length} producto{products.length !== 1 ? 's' : ''}</p>
          {totalLowStock > 0 && (
            <span className="text-[10px] font-medium text-danger bg-danger/10 px-2 py-0.5 rounded-full">
              {totalLowStock} con stock bajo
            </span>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        data={products}
        keyExtractor={(p: Product) => p.id}
        emptyMessage="No se encontraron productos"
        renderCardOnMobile
        page={page}
        onPageChange={setPage}
        total={products.length}
      />
    </div>
  );
}
