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
    console.log('[IWF] Mount/Update', { productId, hasImageUrl: !!imageUrl });
    if (!imageUrl) {
      console.log('[IWF] No imageUrl → error state');
      setLoading(false);
      setError(true);
      return;
    }

    let cancelled = false;

    (async () => {
      console.log('[IWF] Calling acquireImageUrl for', productId);
      const result = await imageCacheService.acquireImageUrl(productId, imageUrl!);
      console.log('[IWF] acquireImageUrl returned for', productId, { isBlob: result.startsWith('blob:'), len: result.length });
      if (cancelled) {
        console.log('[IWF] Cancelled for', productId);
        if (result.startsWith('blob:')) URL.revokeObjectURL(result);
        return;
      }
      if (result.startsWith('blob:')) {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = result;
      }
      setSrc(result);
      // Keep loading=true until the actual <img> fires onLoad (handled below)
      // For blob URLs, they've likely loaded already by the time we reach here,
      // but for consistency, we still wait for onLoad.
      setImgReady(false);
      console.log('[IWF] Set src for', productId, 'waiting for onLoad');
    })();

    return () => {
      console.log('[IWF] Cleanup effect for', productId);
      cancelled = true;
    };
  }, [productId, imageUrl]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const handleLoad = () => {
    console.log('[IWF] onLoad fired for', productId);
    setImgReady(true);
    setLoading(false);
  };

  const handleError = () => {
    console.log('[IWF] onError fired for', productId, 'src=', src?.substring(0, 80));
    setError(true);
    setLoading(false);
  };

  if (error || (!loading && !src)) {
    return (
      <div className={cn('flex items-center justify-center bg-surface-alt', className)}>
        <Package size={24} className="text-gray-300" />
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Skeleton visible while loading or while img not ready */}
      {(loading || (src && !imgReady && !error)) && (
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200px_100%] animate-shimmer',
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
