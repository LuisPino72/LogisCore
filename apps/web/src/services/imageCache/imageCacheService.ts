const CACHE_NAME = 'logiscore-product-images';

/* ───── helpers privados ───── */

async function cacheInBg(url: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const existing = await cache.match(url);
    if (existing) return;
    await cache.add(url);
    console.log('[CACHE] Cached in background:', url.substring(0, 80), '...');
  } catch (err) {
    console.warn('[CACHE] Failed to cache in background:', url.substring(0, 80), err);
  }
}

/* ───── service público ───── */

export const imageCacheService = {
  /**
   * Returns a usable image URL immediately.
   * If cached → blob URL (instant).
   * If not   → raw Supabase URL (triggers network load).
   */
  async acquireImageUrl(productId: string, imageUrl: string): Promise<string> {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(imageUrl);
      if (cached) {
        const blob = await cached.blob();
        const url = URL.createObjectURL(blob);
        console.log('[CACHE] HIT  → blob for', productId, 'size', blob.size);
        return url;
      }
      cacheInBg(imageUrl);
      console.log('[CACHE] MISS → raw URL for', productId, imageUrl.substring(0, 80));
      return imageUrl;
    } catch (err) {
      console.warn('[CACHE] Error acquiring image:', productId, err);
      return imageUrl;
    }
  },

  /** Pre-fetch a list of product images into cache (fire-and-forget). */
  async preloadAll(products: { imageUrl?: string | null }[]): Promise<void> {
    const urls = products.filter((p) => p.imageUrl).map((p) => p.imageUrl!);
    if (urls.length === 0) return;
    console.log('[CACHE] Preloading', urls.length, 'images');
    await Promise.allSettled(urls.map((url) => cacheInBg(url)));
    console.log('[CACHE] Preload done');
  },

  /** Remove a single entry from cache. */
  async invalidate(imageUrl: string): Promise<void> {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(imageUrl);
      console.log('[CACHE] Invalidated:', imageUrl.substring(0, 80));
    } catch {
      // silent
    }
  },
};
