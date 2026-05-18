import { Image as ImageIcon, Star } from 'lucide-react';
import { Card, Badge } from '../../../common/components';
import type { Product } from '../../../specs/inventory';
import { displayStock } from '../../inventory/types';

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
  onToggleFavorite: (productId: string) => void;
  isFavorite: boolean;
  exchangeRateBs: number;
}

export function ProductCard({ product, onAdd, onToggleFavorite, isFavorite, exchangeRateBs }: ProductCardProps) {
  const priceBs = exchangeRateBs > 0
    ? (product.priceUsd * exchangeRateBs).toFixed(2)
    : null;

  const displayQuantity = product.isWeighted
    ? displayStock(product.stock, product.unit)
    : product.stock.toString();

  const stockInDisplay = product.isWeighted
    ? (product.unit === 'kg' || product.unit === 'lt' ? product.stock / 1000 : product.stock)
    : product.stock;
  const isLowStock = stockInDisplay <= (product.stockMin ?? 5);

  return (
    <Card
      interactive
      onClick={() => onAdd(product)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(product); } }}
      role="button"
      tabIndex={0}
      aria-label={`Agregar ${product.name} al carrito`}
      className="relative flex flex-col gap-0 overflow-hidden p-0 active:scale-[0.97] transition-transform"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(product.id);
        }}
        className="absolute top-1.5 right-1.5 z-20 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/80 hover:bg-white active:bg-white transition-colors shadow-sm"
        aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      >
        <Star
          size={16}
          className={isFavorite ? 'text-warning fill-warning' : 'text-gray-400'}
        />
      </button>

      <div className="relative aspect-4/3 bg-surface-alt flex items-center justify-center overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <ImageIcon size={32} className="text-gray-300" />
        )}

        {product.isTaxable && (
          <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-info/80 text-white text-[10px] font-semibold leading-none z-10">
            IVA
          </span>
        )}

        {product.isWeighted && (
          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-accent/80 text-white text-[10px] font-semibold leading-none z-10">
            {product.unit}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 p-2 flex-1">
        <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight">
          {product.name}
        </p>

        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-bold text-primary">
            $ {product.priceUsd.toFixed(2)}
          </p>
          {priceBs && (
            <p className="text-xs text-gray-500 leading-none">Bs {priceBs}</p>
          )}
        </div>

        <div className="flex items-center gap-1 mt-auto pt-1">
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
}
