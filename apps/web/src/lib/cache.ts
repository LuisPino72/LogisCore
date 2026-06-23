import { getDb, isDbReady } from '../services/dexie/db';

export function createVolatileCache<T>(opts?: {
  ttlMs?: number;
  maxSize?: number;
}): {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
} {
  const { ttlMs, maxSize } = opts ?? {};
  const cache = new Map<string, { value: T; ts: number }>();

  function get(key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (ttlMs !== undefined && Date.now() - entry.ts > ttlMs) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key: string, value: T): void {
    if (maxSize !== undefined && cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(key, { value, ts: Date.now() });
  }

  return {
    get,
    set,
    has(key: string): boolean {
      return get(key) !== undefined;
    },
    delete(key: string): void {
      cache.delete(key);
    },
    clear(): void {
      cache.clear();
    },
    get size(): number {
      return cache.size;
    },
  };
}

export function createPersistentCache<T>(opts: {
  tableName: string;
}): {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
} {
  return {
    async get(key: string): Promise<T | undefined> {
      if (!isDbReady()) return undefined;
      try {
        const db = getDb();
        return await (db as any)[opts.tableName].get(key) as T | undefined;
      } catch {
        return undefined;
      }
    },
    async set(key: string, value: T): Promise<void> {
      if (!isDbReady()) return;
      try {
        const db = getDb();
        await (db as any)[opts.tableName].put(value, key);
      } catch { /* best-effort */ }
    },
    async delete(key: string): Promise<void> {
      if (!isDbReady()) return;
      try {
        const db = getDb();
        await (db as any)[opts.tableName].delete(key);
      } catch { /* best-effort */ }
    },
    async clear(): Promise<void> {
      if (!isDbReady()) return;
      try {
        const db = getDb();
        await (db as any)[opts.tableName].clear();
      } catch { /* best-effort */ }
    },
  };
}
