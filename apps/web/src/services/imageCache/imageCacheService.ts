const CACHE_NAME = 'logiscore-product-images';

const resolvedUrlsMemoryCache = new Map<string, string>();

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
    return resolvedUrlsMemoryCache.get(imageUrl) ?? null;
  },

  async acquireImageUrl(_productId: string, imageUrl: string): Promise<string> {
    const inMemory = resolvedUrlsMemoryCache.get(imageUrl);
    if (inMemory) return inMemory;

    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(imageUrl);
      if (cached) {
        const blob = await cached.blob();
        const blobUrl = URL.createObjectURL(blob);
        resolvedUrlsMemoryCache.set(imageUrl, blobUrl);
        return blobUrl;
      }
      cacheInBg(imageUrl);
      resolvedUrlsMemoryCache.set(imageUrl, imageUrl);
      return imageUrl;
    } catch {
      resolvedUrlsMemoryCache.set(imageUrl, imageUrl);
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
