import { networkAware } from '../network/networkAwareService';

const CACHE_NAME = 'logiscore-product-images';
const MAX_CACHE_SIZE = 100;

const resolvedUrlsMemoryCache = new Map<string, string>();

function touch(key: string): void {
  const value = resolvedUrlsMemoryCache.get(key);
  if (value !== undefined) {
    resolvedUrlsMemoryCache.delete(key);
    resolvedUrlsMemoryCache.set(key, value);
  }
}

function trimCache(): void {
  while (resolvedUrlsMemoryCache.size > MAX_CACHE_SIZE) {
    const entry = resolvedUrlsMemoryCache.entries().next().value;
    if (!entry) break;
    const [key, value] = entry;
    if (value.startsWith('blob:')) {
      URL.revokeObjectURL(value);
    }
    resolvedUrlsMemoryCache.delete(key);
  }
}

async function cacheInBg(url: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const existing = await cache.match(url);
    if (existing) return;
    await cache.add(url);
  } catch {
    // silent
  }
}

export const imageCacheService = {
  getResolvedUrl(imageUrl: string): string | null {
    if (!resolvedUrlsMemoryCache.has(imageUrl)) return null;
    touch(imageUrl);
    return resolvedUrlsMemoryCache.get(imageUrl)!;
  },

  async acquireImageUrl(_productId: string, imageUrl: string): Promise<string> {
    const inMemory = resolvedUrlsMemoryCache.get(imageUrl);
    if (inMemory) {
      touch(imageUrl);
      return inMemory;
    }

    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(imageUrl);
      if (cached) {
        const blob = await cached.blob();
        const blobUrl = URL.createObjectURL(blob);
        resolvedUrlsMemoryCache.set(imageUrl, blobUrl);
        trimCache();
        return blobUrl;
      }

      // No está en caché offline. Lo descargamos de forma controlada en un solo fetch
      // para evitar la doble descarga por red (una por fetch y otra por <img>).
      try {
        const response = await fetch(imageUrl, { mode: 'cors' });
        if (response.ok) {
          const clone = response.clone();
          await cache.put(imageUrl, response);
          const blob = await clone.blob();
          const blobUrl = URL.createObjectURL(blob);
          resolvedUrlsMemoryCache.set(imageUrl, blobUrl);
          trimCache();
          return blobUrl;
        }
      } catch {
        // En caso de CORS o falla de red, dejamos que el navegador intente cargarla en background
        cacheInBg(imageUrl);
      }

      resolvedUrlsMemoryCache.set(imageUrl, imageUrl);
      trimCache();
      return imageUrl;
    } catch {
      resolvedUrlsMemoryCache.set(imageUrl, imageUrl);
      trimCache();
      return imageUrl;
    }
  },

  async preloadAll(products: { imageUrl?: string | null }[], force = false): Promise<void> {
    // En datos móviles, NO precargamos imágenes (protege el plan de megas del bodeguero)
    // Forzar con force=true para precargar incluso en datos móviles si es necesario
    if (!force && !networkAware.shouldPreloadImages()) return;
    const urls = Array.from(new Set(products.filter((p) => p.imageUrl).map((p) => p.imageUrl!)));
    if (urls.length === 0) return;

    // Procesamos la precarga offline con concurrencia máxima controlada (3 descargas simultáneas)
    // para evitar saturar el canal de red de la base de datos y de la sincronización.
    const CONCURRENCY_LIMIT = 3;
    const queue = [...urls];

    const worker = async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (!url) break;
        await cacheInBg(url);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, queue.length) }, worker);
    await Promise.allSettled(workers);
  },

  async invalidate(imageUrl: string): Promise<void> {
    try {
      const cachedBlobUrl = resolvedUrlsMemoryCache.get(imageUrl);
      if (cachedBlobUrl && cachedBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(cachedBlobUrl);
      }
      resolvedUrlsMemoryCache.delete(imageUrl);

      const cache = await caches.open(CACHE_NAME);
      await cache.delete(imageUrl);
    } catch {
      // silent
    }
  },
};
