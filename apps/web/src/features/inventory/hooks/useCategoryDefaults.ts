import { useState, useEffect, useCallback } from 'react';
import { getDb } from '../../../services/dexie/db';

export function useCategoryDefaults(tenantId: string | undefined) {
  const [defaults, setDefaults] = useState<Map<string, string>>(new Map());

  const loadDefaults = useCallback(async () => {
    if (!tenantId) return;

    try {
      const db = getDb();
      const categories = await db.categories
        .where({ tenantId })
        .filter((cat) => !cat.deletedAt)
        .toArray();

      const map = new Map<string, string>();
      for (const cat of categories) {
        if (cat.defaultImageUrl) {
          map.set(cat.id, cat.defaultImageUrl);
        }
      }
      setDefaults(map);
    } catch {
      // Silencioso — fallback a null en cada categoría
    }
  }, [tenantId]);

  useEffect(() => {
    loadDefaults();
  }, [loadDefaults]);

  return defaults;
}
