import { useState, useEffect, useRef } from 'react';
import { Package } from 'lucide-react';
import { cn } from '../../lib/utils';
import { imageCacheService } from '../../services/imageCache/imageCacheService';

interface ImageWithFallbackProps {
  productId: string;
  imageUrl?: string | null;
  alt: string;
  className?: string;
  skeletonClassName?: string;
}

// Cache para sobrevivir a remounts y cambios temporales en el store
const globalImageUrlCache = new Map<string, string>();

export function ImageWithFallback({
  productId,
  imageUrl,
  alt,
  className,
  skeletonClassName,
}: ImageWithFallbackProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imgReady, setImgReady] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Si el store temporalmente pierde imageUrl, usamos el último conocido
    if (imageUrl) {
      globalImageUrlCache.set(productId, imageUrl);
    }
    const effectiveImageUrl = imageUrl || globalImageUrlCache.get(productId);

    if (!effectiveImageUrl) {
      setLoading(false);
      setError(true);
      setSrc(null);
      setImgReady(false);
      return;
    }

    let isActive = true;

    (async () => {
      const result = await imageCacheService.acquireImageUrl(productId, effectiveImageUrl);
      if (!isActive) return;
      if (result.startsWith('blob:')) {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = result;
      }
      setSrc(result);
      setLoading(false);
      setImgReady(false);
    })();

    return () => {
      isActive = false;
    };
  }, [productId, imageUrl]);

  // Cleanup: revocar solo la URL que fue efectivamente seteada en este componente
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const handleLoad = () => {
    setImgReady(true);
  };

  const handleError = () => {
    setError(true);
  };

  if (error || (!src && !loading)) {
    return (
      <div className={cn('flex items-center justify-center bg-surface-alt', className)}>
        <Package size={24} className="text-gray-300" />
      </div>
    );
  }

  const showSkeleton = (loading || (src && !imgReady)) && !error;

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {showSkeleton && (
        <div
          className={cn(
            'absolute inset-0 bg-linear-to-r from-gray-200 via-gray-100 to-gray-200 bg-size-[200px_100%] animate-shimmer',
            skeletonClassName,
          )}
        />
      )}
      {src && (
        <img
          src={src}
          alt={alt}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-300',
            imgReady ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}
