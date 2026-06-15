import { memo } from 'react';
import { Star } from 'lucide-react';
import { Card, Badge, ImageWithFallback } from '../../../common/components';
import type { Product } from '../../../specs/inventory';
import { displayStock } from '../../inventory/types';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
  onToggleFavorite: (productId: string) => void;
  isFavorite: boolean;
  exchangeRateBs: number;
  presentationCount?: number;
  onReorder?: (product: Product) => void;
  hasAssemblyRecipe?: boolean;
}

export const ProductCard = memo(function ProductCard({ product, onAdd, onToggleFavorite, isFavorite, exchangeRateBs, presentationCount, onReorder, hasAssemblyRecipe }: ProductCardProps) {
  const priceBs = exchangeRateBs > 0
    ? formatBs(product.priceUsd * exchangeRateBs)
    : null;

  const displayQuantity = product.isWeighted
    ? displayStock(product.stock, product.unit)
    : product.stock.toString();

  const stockInDisplay = product.isWeighted
    ? (product.unit === 'kg' || product.unit === 'lt' ? product.stock / 1000 : product.stock)
    : product.stock;
  const isLowStock = stockInDisplay <= (product.stockMin ?? 5);
  const isOutOfStock = stockInDisplay <= 0 && !hasAssemblyRecipe;

  return (
    <Card
      interactive={!isOutOfStock}
      onClick={() => !isOutOfStock && onAdd(product)}
      onKeyDown={(e) => { if (!isOutOfStock && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAdd(product); } }}
      role="button"
      tabIndex={isOutOfStock ? -1 : 0}
      aria-label={isOutOfStock ? `${product.name} sin stock` : `Agregar ${product.name} al carrito`}
      bodyClassName="p-0"
      className={`relative flex flex-col gap-0 overflow-hidden transition-all duration-200 ${isOutOfStock ? 'opacity-60 cursor-not-allowed' : 'active:scale-[0.98] cursor-pointer hover:shadow-md hover:-translate-y-0.5'}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(product.id);
        }}
        className="absolute top-1 right-1 z-20 min-w-11 min-h-11 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm hover:bg-white active:bg-white transition-colors shadow-sm"
        aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      >
        <Star
          size={16}
          strokeWidth={2.5}
          className={`transition-all ${isFavorite ? 'text-accent fill-accent drop-shadow-sm' : 'text-gray-500'}`}
        />
      </button>

      <div className="relative bg-surface-alt overflow-hidden aspect-4/3">
        <ImageWithFallback
          productId={product.id}
          imageUrl={product.imageUrl}
          alt={product.name}
          className="absolute inset-0"
          skeletonClassName="rounded-none"
        />

        {product.isTaxable && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-primary/85 text-white text-[10px] font-semibold leading-none z-10 shadow-xs">
            IVA
          </span>
        )}

        {presentationCount != null && presentationCount > 0 && (
          <span className="absolute top-1.5 right-7 px-1.5 py-0.5 rounded-md bg-accent/85 text-white text-[10px] font-semibold leading-none z-10 shadow-xs">
            {presentationCount} var.
          </span>
        )}

        {product.isWeighted && (
          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-accent/85 text-white text-[10px] font-semibold leading-none z-10 shadow-xs">
            {product.unit}
          </span>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <span className="px-2.5 py-1 rounded-lg bg-gray-900/70 text-white text-xs font-semibold shadow-sm">
              Sin stock
            </span>
          </div>
        )}
        {isOutOfStock && !hasAssemblyRecipe && onReorder && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReorder(product);
            }}
            className="absolute bottom-1.5 left-1.5 px-2 py-1 rounded-md bg-accent text-white text-xs font-semibold leading-none z-20 shadow-sm hover:bg-accent/90 active:bg-accent/80 transition-colors min-h-11 min-w-11"
            aria-label={`Pedir ${product.name}`}
          >
            + Pedir
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1 p-2 flex-1">
        <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight">
          {product.name}
        </p>

        <div className="flex flex-col gap-0.5">
          <p className="text-base font-bold text-primary">
            {formatUsd(product.priceUsd)}
          </p>
          {priceBs && (
            <p className="text-xs text-text-muted leading-none">{priceBs}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 mt-auto pt-1">
          {!product.isTaxable && (
            <Badge variant="neutral" className="text-[10px] px-1 py-0.5">Exento</Badge>
          )}
          <Badge variant={isLowStock ? 'warning' : 'success'} className="text-[10px] px-1 py-0.5">
            {displayQuantity}
          </Badge>
        </div>
      </div>
    </Card>
  );
});
