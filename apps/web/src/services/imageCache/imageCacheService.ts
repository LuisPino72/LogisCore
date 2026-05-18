const CACHE_NAME = 'logiscore-product-images';

/* ───── helpers privados ───── */

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

/* ───── service público ───── */

export const imageCacheService = {
  /**
   * Returns a usable image URL immediately.
   * If cached → blob URL (instant).
   * If not   → raw Supabase URL (triggers network load).
   */
  async acquireImageUrl(_productId: string, imageUrl: string): Promise<string> {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(imageUrl);
      if (cached) {
        const blob = await cached.blob();
        return URL.createObjectURL(blob);
      }
      cacheInBg(imageUrl);
      return imageUrl;
    } catch {
      return imageUrl;
    }
  },

  /** Pre-fetch a list of product images into cache (fire-and-forget). */
  async preloadAll(products: { imageUrl?: string | null }[]): Promise<void> {
    const urls = products.filter((p) => p.imageUrl).map((p) => p.imageUrl!);
    if (urls.length === 0) return;
    await Promise.allSettled(urls.map((url) => cacheInBg(url)));
  },

  /** Remove a single entry from cache. */
  async invalidate(imageUrl: string): Promise<void> {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(imageUrl);
    } catch {
      // silent
    }
  },
};
