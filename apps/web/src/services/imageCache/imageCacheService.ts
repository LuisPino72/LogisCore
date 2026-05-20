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
      cacheInBg(imageUrl);
      resolvedUrlsMemoryCache.set(imageUrl, imageUrl);
      trimCache();
      return imageUrl;
    } catch {
      resolvedUrlsMemoryCache.set(imageUrl, imageUrl);
      trimCache();
      return imageUrl;
    }
  },

  async preloadAll(products: { imageUrl?: string | null }[]): Promise<void> {
    const urls = products.filter((p) => p.imageUrl).map((p) => p.imageUrl!);
    if (urls.length === 0) return;
    await Promise.allSettled(urls.map((url) => cacheInBg(url)));
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
