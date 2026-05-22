import { useState, useMemo, useEffect } from 'react';
import { Package, Trash2, Plus, AlertTriangle, Edit3, Layers, ClipboardList, MoreVertical } from 'lucide-react';
import { Button, Badge, DataTable, Dropdown, EmptyState, ImageWithFallback, SearchableSelect } from '../../../common/components';
import type { Column } from '../../../common/components';
import { ProductSearchInput } from './ProductSearchInput';
import type { Product, Category, TabState, StockFilter } from '../types';
import { displayStock } from '../types';
import { formatUsd } from '@/lib/formatBs';

interface ProductListProps {
  products: Product[];
  categories: Category[];
  onSearch: (query: string, categoryId?: string) => void;
  initialTabState: TabState;
  onSaveTabState: (state: Partial<TabState>) => void;
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

function applyStockFilter(product: Product, filter: StockFilter): boolean {
  const displayStock = product.isWeighted ? (product.unit === 'kg' || product.unit === 'lt' ? product.stock / 1000 : product.stock) : product.stock;
  const threshold = product.stockMin ?? 5;
  switch (filter) {
    case 'all': return true;
    case 'in_stock': return displayStock > threshold;
    case 'low_stock': return displayStock > 0 && displayStock <= threshold;
    case 'out_of_stock': return displayStock === 0;
  }
}

function getStockVariant(product: Product): 'success' | 'warning' | 'danger' {
  const displayStock = product.isWeighted && (product.unit === 'kg' || product.unit === 'lt')
    ? product.stock / 1000
    : product.stock;
  if (product.stockMin && displayStock <= product.stockMin) return 'danger';
  if (product.stockMin && displayStock <= product.stockMin * 2) return 'warning';
  return 'success';
}

export function ProductList({ products, categories, onSearch, initialTabState, onSaveTabState, isOwner, totalLowStock = 0, onNewProduct, onEditProduct, onRequestDelete, onAdjust, onViewLots, onViewKardex }: ProductListProps) {
  const [searchQuery, setSearchQuery] = useState(initialTabState.searchQuery);
  const [filterCategory, setFilterCategory] = useState(initialTabState.filterCategory);
  const [stockFilter, setStockFilter] = useState<StockFilter>(initialTabState.stockFilter);
  const [page, setPage] = useState(initialTabState.page);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterCategory]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSaveTabState({ searchQuery: value, filterCategory, page });
    onSearch(value, filterCategory || undefined);
  };

  const handleCategoryFilter = (categoryId: string) => {
    setFilterCategory(categoryId);
    onSaveTabState({ searchQuery, filterCategory: categoryId, page });
    onSearch(searchQuery, categoryId || undefined);
  };

  const handleStockFilter = (value: StockFilter, el: HTMLElement) => {
    setStockFilter(value);
    onSaveTabState({ searchQuery, filterCategory, stockFilter: value, page });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const stockOptions: { value: StockFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'in_stock', label: 'Stock alto' },
    { value: 'low_stock', label: 'Stock bajo' },
    { value: 'out_of_stock', label: 'Sin stock' },
  ];

  const filteredByStock = useMemo(() => {
    return products.filter((p) => applyStockFilter(p, stockFilter));
  }, [products, stockFilter]);

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
            {product.stockMin && parseFloat(displayStock(product.stock, product.unit)) <= product.stockMin && (
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
          <SearchableSelect
            value={filterCategory}
            onChange={handleCategoryFilter}
            options={[
              { value: '', label: 'Todas las categorías' },
              ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
            ]}
            placeholder="Todas las categorías"
            searchPlaceholder="Buscar categoría..."
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {stockOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={(e) => handleStockFilter(opt.value, e.currentTarget)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
              stockFilter === opt.value
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-white text-text-secondary border-border hover:border-primary/30 hover:text-primary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {filteredByStock.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-text-secondary">{filteredByStock.length} producto{filteredByStock.length !== 1 ? 's' : ''}</p>
          {totalLowStock > 0 && (
            <span className="text-[10px] font-medium text-danger bg-danger/10 px-2 py-0.5 rounded-full">
              {totalLowStock} con stock bajo
            </span>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredByStock}
        keyExtractor={(p: Product) => p.id}
        rowClassName={(p: Product) => p.stockMin && parseFloat(displayStock(p.stock, p.unit)) <= p.stockMin ? 'ring-1 ring-danger/40 bg-danger/[0.03]' : undefined}
        emptyMessage="No se encontraron productos"
        renderCardOnMobile
        page={page}
        onPageChange={(newPage) => {
          setPage(newPage);
          onSaveTabState({ searchQuery, filterCategory, stockFilter, page: newPage });
        }}
        total={filteredByStock.length}
      />
    </div>
  );
}
