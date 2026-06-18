import { useState, useMemo, useEffect } from 'react';
import { Package, Trash2, Plus, AlertTriangle, Edit3, Layers, Settings, ClipboardCheck, DollarSign } from 'lucide-react';
import { Button, Badge, DataTable, EmptyState, ImageWithFallback, SearchableSelect, Modal, Tooltip } from '../../../common/components';
import type { Column } from '../../../common/components';
import { ProductSearchInput } from './ProductSearchInput';
import { useProductFuzzySearch } from '../hooks/useProductFuzzySearch';
import type { Product, Category, TabState, StockFilter, ProductTypeFilter } from '../types';
import { displayStock } from '../types';
import { formatUsd } from '@/lib/formatBs';
import { useInventoryStore } from '../stores/inventoryStore';
import { getDb } from '@/services/dexie/db';

interface ProductListProps {
  products: Product[];
  categories: Category[];
  tenantId: string;
  onSearch: (query: string, categoryId?: string) => void;
  initialTabState: TabState;
  onSaveTabState: (state: Partial<TabState>) => void;
  isOwner: boolean;
  isOnline: boolean;
  totalLowStock?: number;
  onNewProduct: () => void;
  onEditProduct: (product: Product) => void;
  onRequestDelete: (id: string, name: string) => void;
  onAdjust: (id: string) => void;
  onViewLots: (productId: string) => void;
  onRefresh: () => void;
  onBulkAdjust?: (productIds: string[]) => void;
  onBulkPriceUpdate?: (productIds: string[]) => void;
}

function getStockLabel(isWeighted: boolean, unit: string): string {
  if (isWeighted) return unit === 'lt' ? 'Lt' : unit === 'm' ? 'm' : 'Kg';
  return 'Total';
}

type ProductBadgeType = 'vendible' | 'no-vendible' | 'pesable' | 'materia-prima' | 'variantes';

const PRODUCT_BADGE_STYLES: Record<ProductBadgeType, string> = {
  vendible: 'text-green-700 bg-green-50',
  'no-vendible': 'text-orange-700 bg-orange-50',
  pesable: 'text-teal-700 bg-teal-50',
  'materia-prima': 'text-amber-700 bg-amber-50',
  variantes: 'text-primary bg-primary/10',
};

const PRODUCT_BADGE_LABELS: Record<ProductBadgeType, string> = {
  vendible: 'Vendible',
  'no-vendible': 'No vendible',
  pesable: 'Pesable',
  'materia-prima': 'Materia prima',
  variantes: 'Variantes',
};

function ProductBadge({ type, className = '' }: { type: ProductBadgeType; className?: string }) {
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${PRODUCT_BADGE_STYLES[type]} ${className}`}>
      {PRODUCT_BADGE_LABELS[type]}
    </span>
  );
}

function getStockBadgeContent(stock: number, unit: string, isWeighted: boolean): string {
  const display = displayStock(stock, unit);
  const label = getStockLabel(isWeighted, unit);
  return `${display} ${label}`;
}

function getDisplayStockMin(product: { stockMin?: number; isWeighted: boolean; unit: string }): number | undefined {
  if (product.stockMin == null) return undefined;
  if (product.isWeighted && (product.unit === 'kg' || product.unit === 'lt' || product.unit === 'm')) {
    return product.stockMin / 1000;
  }
  return product.stockMin;
}

function applyStockFilter(stock: number, product: { stockMin?: number; isWeighted: boolean; unit: string }, filter: StockFilter): boolean {
  const displayStock = product.isWeighted ? (product.unit === 'kg' || product.unit === 'lt' || product.unit === 'm' ? stock / 1000 : stock) : stock;
  const threshold = getDisplayStockMin(product) ?? 5;
  switch (filter) {
    case 'all': return true;
    case 'in_stock': return displayStock > threshold;
    case 'low_stock': return displayStock > 0 && displayStock <= threshold;
    case 'out_of_stock': return displayStock === 0;
  }
}

function getStockVariant(stock: number, product: { stockMin?: number; isWeighted: boolean; unit: string }): 'success' | 'warning' | 'danger' {
  const displayStock = product.isWeighted && (product.unit === 'kg' || product.unit === 'lt' || product.unit === 'm')
    ? stock / 1000
    : stock;
  const min = getDisplayStockMin(product);
  if (min && displayStock <= min) return 'danger';
  if (min && displayStock <= min * 2) return 'warning';
  return 'success';
}

function applyProductTypeFilter(product: { isWeighted: boolean; id: string; productType?: string }, filter: ProductTypeFilter, productIdsWithVariants: Set<string>): boolean {
  switch (filter) {
    case 'all': return true;
    case 'simple': return !product.isWeighted && !productIdsWithVariants.has(product.id) && product.productType !== 'materia_prima';
    case 'weighted': return product.isWeighted && product.productType !== 'materia_prima';
    case 'with_variants': return productIdsWithVariants.has(product.id);
    case 'raw_material': return product.productType === 'materia_prima';
  }
}

interface ProductActionsProps {
  product: Product;
  bulkMode: boolean;
  isOwner: boolean;
  isOnline: boolean;
  selectedForBulk: Set<string>;
  onToggleBulk: (id: string) => void;
  onEdit: (product: Product) => void;
  onDelete: (id: string, name: string) => void;
  onAdjust: (id: string) => void;
  onViewLots: (id: string) => void;
}

function ProductActions({ product, bulkMode, isOwner, isOnline, selectedForBulk, onToggleBulk, onEdit, onDelete, onAdjust, onViewLots }: ProductActionsProps) {
  if (!isOwner) return null;

  if (bulkMode) {
    return (
      <button
        type="button"
        disabled={!product.isSellable}
        onClick={() => onToggleBulk(product.id)}
        className={`min-w-11 min-h-11 rounded-full flex items-center justify-center transition-colors ${
          product.isSellable ? 'hover:bg-primary/10' : 'opacity-30 cursor-not-allowed'
        }`}
      >
        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
          selectedForBulk.has(product.id)
            ? 'bg-primary border-primary'
            : 'border-gray-300 bg-white'
        }`}>
          {selectedForBulk.has(product.id) && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-row sm:items-center sm:justify-end sm:gap-0 sm:flex-nowrap max-w-[120px] sm:max-w-none">
      <Tooltip content="Editar producto" variant="help">
        <Button variant="ghost-primary" size="sm" onClick={() => onEdit(product)} className="p-1 min-w-0 min-h-10 sm:min-w-10" aria-label="Editar" disabled={!isOnline}>
          <Edit3 size={15} />
        </Button>
      </Tooltip>
      <Tooltip content="Eliminar producto" variant="help">
        <Button variant="ghost-danger" size="sm" onClick={() => onDelete(product.id, product.name)} className="p-1 min-w-0 min-h-10 sm:min-w-10" aria-label="Eliminar" disabled={!isOnline}>
          <Trash2 size={15} />
        </Button>
      </Tooltip>
      <Tooltip content="Ajustar stock" variant="help">
        <Button variant="ghost-accent" size="sm" onClick={() => onAdjust(product.id)} className="p-1 min-w-0 min-h-10 sm:min-w-10" aria-label="Ajustar stock" disabled={!isOnline}>
          <Settings size={15} />
        </Button>
      </Tooltip>
      <Tooltip content="Ver lotes" variant="help">
        <Button variant="ghost" size="sm" onClick={() => onViewLots(product.id)} className="p-1 min-w-0 min-h-10 sm:min-w-10" aria-label="Lotes">
          <Layers size={15} />
        </Button>
      </Tooltip>
    </div>
  );
}

export function ProductList({ products, categories, tenantId, onSearch, initialTabState, onSaveTabState, isOwner, isOnline, totalLowStock = 0, onNewProduct, onEditProduct, onRequestDelete, onAdjust, onViewLots, onBulkAdjust, onBulkPriceUpdate }: ProductListProps) {
  const [searchQuery, setSearchQuery] = useState(initialTabState.searchQuery);
  const [filterCategory, setFilterCategory] = useState(initialTabState.filterCategory);
  const [stockFilter, setStockFilter] = useState<StockFilter>(initialTabState.stockFilter);
  const [productTypeFilter, setProductTypeFilter] = useState<ProductTypeFilter>(initialTabState.productTypeFilter ?? 'all');
  const [page, setPage] = useState(initialTabState.page);
  const [productIdsWithVariants, setProductIdsWithVariants] = useState<Set<string>>(new Set());
  const [assemblyProductIds, setAssemblyProductIds] = useState<Set<string>>(new Set());
  const [variantModalProductId, setVariantModalProductId] = useState<string | null>(null);
  const [variantModalData, setVariantModalData] = useState<{ name: string; priceUsd: number }[]>([]);
  const [variantModalLoading, setVariantModalLoading] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());

  const openVariantModal = async (productId: string) => {
    setVariantModalProductId(productId);
    setVariantModalLoading(true);
    try {
      const pres = await useInventoryStore.getState().fetchPresentationsForProduct(productId);
      setVariantModalData(pres.map(p => ({ name: p.name, priceUsd: p.priceUsd })));
    } catch {
      setVariantModalData([]);
    } finally {
      setVariantModalLoading(false);
    }
  };

  const variantModalProduct = variantModalProductId
    ? products.find(p => p.id === variantModalProductId)
    : null;

  useEffect(() => {
    const load = async () => {
      try {
        const ids = await useInventoryStore.getState().fetchAllPresentationProductIds(tenantId);
        setProductIdsWithVariants(ids);
      } catch {
        // silent
      }
    };
    load();
  }, [products, tenantId]);

  useEffect(() => {
    const loadAssembly = async () => {
      try {
        const db = getDb();
        const recipes = await db.recipes
          .where({ tenantId })
          .filter((r) => !r.deletedAt && r.isActive && r.mode === 'assembly')
          .toArray();
        setAssemblyProductIds(new Set(recipes.map((r) => r.productId)));
      } catch {
        // silent
      }
    };
    loadAssembly();
  }, [tenantId]);

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
    onSaveTabState({ searchQuery, filterCategory, stockFilter: value, productTypeFilter, page });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const handleProductTypeFilter = (value: ProductTypeFilter, el: HTMLElement) => {
    setProductTypeFilter(value);
    onSaveTabState({ searchQuery, filterCategory, stockFilter, productTypeFilter: value, page });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const stockOptions: { value: StockFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'in_stock', label: 'Stock alto' },
    { value: 'low_stock', label: 'Stock bajo' },
    { value: 'out_of_stock', label: 'Sin stock' },
  ];

  const productTypeOptions: { value: ProductTypeFilter; label: string }[] = [
    { value: 'all', label: 'Todos los tipos' },
    { value: 'simple', label: 'Simples' },
    { value: 'weighted', label: 'Pesables' },
    { value: 'with_variants', label: 'Con variantes' },
    { value: 'raw_material', label: 'Materia prima' },
  ];

  const fuzzyResults = useProductFuzzySearch(products, searchQuery);

    const filteredByStock = useMemo(() => {
      const result = searchQuery ? fuzzyResults : products;
      return result
        .filter((p) => applyProductTypeFilter(p, productTypeFilter, productIdsWithVariants))
        .filter((p) => {
          if (stockFilter !== 'all' && assemblyProductIds.has(p.id)) return false;
          return applyStockFilter(p.stock, p, stockFilter);
        });
  }, [searchQuery, fuzzyResults, products, stockFilter, productTypeFilter, productIdsWithVariants, assemblyProductIds]);

  const columns = useMemo((): Column<Product>[] => {
    const cols: Column<Product>[] = [
      {
        key: 'image',
        header: '',
        hideOnMobile: true,
        width: '80px',
        align: 'center',
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
        width: '2fr',
        render: (product) => (
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-gray-900">{product.name}</span>
              {productIdsWithVariants.has(product.id) && (
                <span
                  className="hidden md:inline-flex cursor-pointer hover:bg-primary/20 transition-colors badge-bounce"
                  onClick={(e) => { e.stopPropagation(); openVariantModal(product.id); }}
                >
                  <ProductBadge type="variantes" />
                </span>
              )}
              {!product.isSellable && (
                <span className="hidden md:inline-flex">
                  <ProductBadge type="no-vendible" />
                </span>
              )}
              {product.isSellable && !product.isWeighted && product.productType !== 'materia_prima' && (
                <span className="hidden md:inline-flex">
                  <ProductBadge type="vendible" />
                </span>
              )}
              {product.isWeighted && product.productType !== 'materia_prima' && (
                <span className="hidden md:inline-flex">
                  <ProductBadge type="pesable" />
                </span>
              )}
              {product.productType === 'materia_prima' && (
                <span className="hidden md:inline-flex">
                  <ProductBadge type="materia-prima" />
                </span>
              )}
            </div>
            <div className="text-xs text-text-secondary font-mono">{product.sku}</div>
              {productIdsWithVariants.has(product.id) && (
                <div className="flex md:hidden mt-1">
                  <span
                    className="cursor-pointer hover:bg-primary/20 transition-colors"
                    onClick={() => openVariantModal(product.id)}
                  >
                    <ProductBadge type="variantes" />
                  </span>
                </div>
              )}
              {!product.isSellable && (
                <div className="flex md:hidden mt-1">
                  <ProductBadge type="no-vendible" />
                </div>
              )}
              {product.isSellable && !product.isWeighted && product.productType !== 'materia_prima' && (
                <div className="flex md:hidden mt-1">
                  <ProductBadge type="vendible" />
                </div>
              )}
              {product.isWeighted && product.productType !== 'materia_prima' && (
                <div className="flex md:hidden mt-1">
                  <ProductBadge type="pesable" />
                </div>
              )}
              {product.productType === 'materia_prima' && (
                <div className="flex md:hidden mt-1">
                  <ProductBadge type="materia-prima" />
                </div>
              )}
          </div>
        ),
      },
      {
        key: 'price',
        header: 'Precio',
        hideLabelOnMobile: true,
        width: '0.6fr',
        align: 'center',
        render: (product) =>
          product.productType === 'materia_prima' ? (
            <span className="text-sm text-gray-400">—</span>
          ) : (
            <span className="text-sm font-bold text-gray-800">{formatUsd(product.priceUsd)}</span>
          ),
      },
      {
        key: 'stock',
        header: 'Total',
        hideLabelOnMobile: true,
        width: '0.8fr',
        align: 'center',
        render: (product) => {
          return (
            <div className="flex items-center gap-2">
              <Badge variant={getStockVariant(product.stock, product)}>
                {getStockBadgeContent(product.stock, product.unit, product.isWeighted)}
              </Badge>
              {product.stockMin && parseFloat(displayStock(product.stock, product.unit)) <= getDisplayStockMin(product)! && (
                <AlertTriangle size={12} className="text-danger shrink-0" />
              )}
            </div>
          );
        },
      },
      {
        key: 'category',
        header: 'Categoría',
        hideOnMobile: true,
        width: '1fr',
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
        width: '0.8fr',
        align: 'center',
        className: 'overflow-visible',
        render: (product) => (
          <ProductActions
            product={product}
            bulkMode={bulkMode}
            isOwner={isOwner}
            isOnline={isOnline}
            selectedForBulk={selectedForBulk}
            onToggleBulk={(id) => {
              setSelectedForBulk(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onEdit={onEditProduct}
            onDelete={onRequestDelete}
            onAdjust={onAdjust}
            onViewLots={onViewLots}
          />
        ),
      });
    }

    return cols;
  }, [isOwner, isOnline, onAdjust, onEditProduct, onRequestDelete, categories, onViewLots, bulkMode, selectedForBulk]);

  if (products.length === 0 && !searchQuery && !filterCategory) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<Package size={40} />}
          title="Aún no tienes productos"
          description="Agrega tu primer producto al inventario para empezar a controlar tu stock."
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
          <ProductSearchInput maxLength={20} value={searchQuery} onChange={handleSearch} />
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

       <div className="flex flex-wrap gap-2">
         <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {stockOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => handleStockFilter(opt.value, e.currentTarget)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 whitespace-nowrap active:scale-[0.98] ${
                stockFilter === opt.value
                  ? 'bg-primary text-white border-primary shadow-md shadow-primary/30'
                  : 'bg-white text-text-secondary border-border hover:border-primary/30 hover:text-primary hover:bg-primary/2'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {productTypeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => handleProductTypeFilter(opt.value, e.currentTarget)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 whitespace-nowrap active:scale-[0.98] ${
                productTypeFilter === opt.value
                  ? 'bg-primary text-white border-primary shadow-md shadow-primary/30'
                  : 'bg-white text-text-secondary border-border hover:border-primary/30 hover:text-primary hover:bg-primary/2'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isOwner && (
        <div className="flex flex-wrap items-center gap-2">
          {bulkMode ? (
            <>
              <button
                type="button"
                onClick={() => { setBulkMode(false); setSelectedForBulk(new Set()); }}
                className="shrink-0 px-4 py-2.5 min-h-11 rounded-full text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition-all"
              >
                Salir del conteo
              </button>
              <span className="text-xs text-text-secondary">{selectedForBulk.size} seleccionado{selectedForBulk.size !== 1 ? 's' : ''}</span>
              <Button
                variant="primary"
                size="sm"
                disabled={selectedForBulk.size === 0 || !isOnline}
                onClick={() => onBulkAdjust?.(Array.from(selectedForBulk))}
              >
                <ClipboardCheck size={14} />
                Ajustar stock
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={selectedForBulk.size === 0 || !isOnline}
                onClick={() => onBulkPriceUpdate?.(Array.from(selectedForBulk))}
              >
                <DollarSign size={14} />
                Precios
              </Button>
            </>
          ) : (
            <Tooltip content="Selecciona varios productos." variant="help">
              <button
                type="button"
                onClick={() => setBulkMode(true)}
                className="shrink-0 px-4 py-2.5 min-h-11 rounded-full text-xs font-medium border border-primary text-primary hover:bg-primary/5 transition-all flex items-center gap-1.5"
              >
                <ClipboardCheck size={13} />
                Modo conteo
              </button>
            </Tooltip>
          )}
        </div>
      )}

      {filteredByStock.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-text-secondary">{filteredByStock.length} producto{filteredByStock.length !== 1 ? 's' : ''}</p>
          {totalLowStock > 0 && (
            <button
              type="button"
              onClick={() => setStockFilter('low_stock')}
              className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full hover:bg-warning/20 transition-colors cursor-pointer"
            >
              <AlertTriangle size={12} />
              {totalLowStock} con stock bajo
            </button>
          )}
        </div>
      )}

      <DataTable
        className="inventory-stagger"
        columns={columns}
        data={filteredByStock}
        keyExtractor={(p: Product) => p.id}
        rowClassName={(p: Product) => {
          if (bulkMode && selectedForBulk.has(p.id)) return 'bg-primary/5 border-primary/20';
          return p.stockMin && parseFloat(displayStock(p.stock, p.unit)) <= getDisplayStockMin(p)! ? 'ring-1 ring-danger/40 bg-danger/[0.03]' : undefined;
        }}
        emptyMessage="No encontramos productos. Intenta con otro nombre o limpia los filtros."
        renderCardOnMobile
        renderCard={(product: Product) => (
          <div className="card-body">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-28 h-28 mx-auto rounded-lg overflow-hidden bg-gray-100 *:w-full *:h-full">
                <ImageWithFallback
                  productId={product.id}
                  imageUrl={product.imageUrl}
                  alt={product.name}
                  className="shrink-0 rounded-lg object-cover w-full h-full"
                />
              </div>
              <div className="text-sm font-semibold text-gray-900 text-center w-full wrap-break-word">
                {product.name}
              </div>
              <div className="text-[12px] text-text-secondary font-mono text-center">
                {product.sku}
              </div>
              {productIdsWithVariants.has(product.id) && (
                <span
                  className="cursor-pointer hover:bg-primary/20 transition-colors"
                  onClick={() => openVariantModal(product.id)}
                >
                  <ProductBadge type="variantes" />
                </span>
              )}
              {!product.isSellable && (
                <ProductBadge type="no-vendible" />
              )}
              {product.isSellable && !product.isWeighted && product.productType !== 'materia_prima' && (
                <ProductBadge type="vendible" />
              )}
              {product.isWeighted && product.productType !== 'materia_prima' && (
                <ProductBadge type="pesable" />
              )}
              <div className="mt-1 text-xs text-gray-600 space-y-1 flex flex-col items-center">
                {product.productType !== 'materia_prima' && (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-gray-500">Precio</span>
                    <span className="text-gray-800 text-sm font-semibold">{formatUsd(product.priceUsd)}</span>
                  </div>
                )}
                <div className="flex items-center justify-center gap-2">
                  <span className="text-gray-500">Total</span>
                  <Badge variant={getStockVariant(product.stock, product)}>
                    {getStockBadgeContent(product.stock, product.unit, product.isWeighted)}
                  </Badge>
                </div>
                {isOwner && (
                  <div className="mt-2 grid grid-cols-2 gap-1 sm:flex sm:flex-row sm:items-center sm:justify-center sm:gap-0.5">
                    {bulkMode ? (
                      <button
                        type="button"
                        disabled={!product.isSellable}
                        onClick={() => {
                          setSelectedForBulk(prev => {
                            const next = new Set(prev);
                            if (next.has(product.id)) next.delete(product.id);
                            else next.add(product.id);
                            return next;
                          });
                        }}
                        className={`min-w-11 min-h-11 rounded-full flex items-center justify-center transition-colors ${
                          product.isSellable ? 'hover:bg-primary/10' : 'opacity-30 cursor-not-allowed'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                          selectedForBulk.has(product.id)
                            ? 'bg-primary border-primary'
                            : 'border-gray-300 bg-white'
                        }`}>
                          {selectedForBulk.has(product.id) && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          )}
                        </div>
                      </button>
                    ) : (
                      <>
                        <Button variant="ghost-primary" size="sm" onClick={() => onEditProduct(product)} className="p-1.5 min-w-0 min-h-11 sm:min-w-11" aria-label="Editar" disabled={!isOnline}>
                          <Edit3 size={15} />
                        </Button>
                        <Button variant="ghost-danger" size="sm" onClick={() => onRequestDelete(product.id, product.name)} className="p-1.5 min-w-0 min-h-11 sm:min-w-11" aria-label="Eliminar" disabled={!isOnline}>
                          <Trash2 size={15} />
                        </Button>
                        <Button variant="ghost-accent" size="sm" onClick={() => onAdjust(product.id)} className="p-1.5 min-w-0 min-h-11 sm:min-w-11" aria-label="Ajustar stock" disabled={!isOnline}>
                          <Settings size={15} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onViewLots(product.id)} className="p-1.5 min-w-0 min-h-11 sm:min-w-11" aria-label="Lotes">
                          <Layers size={15} />
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        page={page}
        onPageChange={(newPage) => {
          setPage(newPage);
          onSaveTabState({ searchQuery, filterCategory, stockFilter, page: newPage });
        }}
        total={filteredByStock.length}
      />

      <Modal
        isOpen={!!variantModalProductId}
        onClose={() => setVariantModalProductId(null)}
        title={variantModalProduct ? `Variantes de ${variantModalProduct.name}` : 'Variantes'}
        size="sm"
      >
        {variantModalLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : variantModalData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No hay variantes. Agrega variantes desde "Editar" producto.</p>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {variantModalData.map((v, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-800">{v.name}</span>
                <span className="text-sm font-semibold text-primary ml-4 shrink-0">{formatUsd(v.priceUsd)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
