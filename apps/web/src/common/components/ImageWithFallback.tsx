import { useState, useEffect, useRef } from 'react';
import { Package } from 'lucide-react';
import { cn } from '../../lib/utils';
import { imageCacheService } from '../../services/imageCache/imageCacheService';
import { getCategorySvg } from './CategoryPlaceholders';

interface ImageWithFallbackProps {
  productId: string;
  imageUrl?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryDefaults?: Map<string, string>;
  alt: string;
  className?: string;
  skeletonClassName?: string;
}

const globalImageUrlCache = new Map<string, string>();

export function ImageWithFallback({
  productId,
  imageUrl,
  categoryId,
  categoryName,
  categoryDefaults,
  alt,
  className,
  skeletonClassName,
}: ImageWithFallbackProps) {
  if (imageUrl) {
    globalImageUrlCache.set(productId, imageUrl);
  }
  const effectiveImageUrl = imageUrl || globalImageUrlCache.get(productId);

  // Fallback de 4 niveles: imagen -> default categoría (via Map) -> SVG placeholder -> Package icon
  const resolvedUrl = effectiveImageUrl || (categoryId ? categoryDefaults?.get(categoryId) ?? null : null);
  const CategorySvg = !resolvedUrl ? getCategorySvg(categoryName) : null;

  const prevProductIdRef = useRef<string | null>(null);
  const prevImageUrlRef = useRef<string | null>(null);

  const cachedResolved = resolvedUrl ? imageCacheService.getResolvedUrl(resolvedUrl) : null;

  const [src, setSrc] = useState<string | null>(cachedResolved || null);
  const [loading, setLoading] = useState(!cachedResolved);
  const [error, setError] = useState(false);
  const [imgReady, setImgReady] = useState(!!cachedResolved);

  useEffect(() => {
    if (imageUrl) {
      globalImageUrlCache.set(productId, imageUrl);
    }
    const currentEffectiveImageUrl = effectiveImageUrl || (categoryId ? categoryDefaults?.get(categoryId) ?? null : null);

    if (!currentEffectiveImageUrl) {
      setLoading(false);
      setError(true);
      setSrc(null);
      setImgReady(false);
      return;
    }

    const alreadyResolved = imageCacheService.getResolvedUrl(currentEffectiveImageUrl);
    if (alreadyResolved) {
      setSrc(alreadyResolved);
      setLoading(false);
      setImgReady(true);
      return;
    }

    let isActive = true;

    const timeoutId = setTimeout(() => {
      if (!isActive) return;
      setSrc(currentEffectiveImageUrl);
      setLoading(false);
    }, 3000);

    (async () => {
      const result = await imageCacheService.acquireImageUrl(productId, currentEffectiveImageUrl);
      if (!isActive) return;
      clearTimeout(timeoutId);
      setSrc(result);
      setLoading(false);
    })();

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [productId, imageUrl, categoryId, categoryDefaults, effectiveImageUrl]);

  useEffect(() => {
    if (prevProductIdRef.current !== productId || prevImageUrlRef.current !== (imageUrl || null)) {
      prevProductIdRef.current = productId;
      prevImageUrlRef.current = imageUrl || null;
      setSrc(cachedResolved || null);
      setLoading(!cachedResolved);
      setError(false);
      setImgReady(!!cachedResolved);
    }
  }, [productId, imageUrl, cachedResolved]);

  const handleLoad = () => {
    setImgReady(true);
  };

  const handleError = () => {
    setError(true);
  };

  if (CategorySvg && !resolvedUrl) {
    return (
      <div className={cn('flex items-center justify-center bg-surface-alt overflow-hidden', className)}>
        <CategorySvg className="w-full h-full" />
      </div>
    );
  }

  if (error || (!src && !loading)) {
    return (
      <div className={cn('flex items-center justify-center bg-surface-alt', className)}>
        <Package size={24} className="text-gray-300" aria-hidden="true" />
      </div>
    );
  }

  const showSkeleton = (loading || (src && !imgReady)) && !error;

  return (
    <div className={cn('relative w-full h-full overflow-hidden', className)}>
      {showSkeleton && (
        <div
          className={cn(
            'absolute inset-0 bg-linear-to-r from-gray-200 via-gray-100 to-gray-200 bg-size-[200px_100%] animate-shimmer z-10',
            skeletonClassName,
          )}
          aria-hidden="true"
        />
      )}
      {src && (
        <img
          src={src}
          alt={alt}
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            imgReady ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}
