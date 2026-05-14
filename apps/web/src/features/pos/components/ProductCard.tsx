import { Card, Badge } from '../../../common/components';
import { Package, Star } from 'lucide-react';
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

  return (
    <Card
      interactive
      onClick={() => onAdd(product)}
      className="flex flex-col gap-1 relative"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(product.id);
        }}
        className="absolute top-1.5 right-1.5 p-1 rounded-full hover:bg-surface-alt transition-colors z-10"
      >
        <Star
          size={14}
          className={isFavorite ? 'text-warning fill-warning' : 'text-gray-300'}
        />
      </button>

      <div className="flex items-start gap-2 pr-6">
        <div className="w-10 h-10 rounded-lg bg-surface-alt flex items-center justify-center shrink-0">
          <Package size={20} className="text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{product.name}</p>
          <p className="text-xs text-gray-500 truncate">{product.sku}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="flex flex-col">
          <p className="text-sm font-bold text-primary">$ {product.priceUsd.toFixed(2)}</p>
          {priceBs && (
            <p className="text-xs text-gray-500">Bs {priceBs}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {product.isWeighted && (
            <Badge variant="info">{product.unit}</Badge>
          )}
          {product.isTaxable !== undefined && !product.isTaxable && (
            <Badge variant="neutral">Exento</Badge>
          )}
          <Badge variant={product.stock <= (product.stockMin ?? 5) ? 'warning' : 'neutral'}>
            {displayQuantity}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
