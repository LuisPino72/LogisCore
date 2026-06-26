import { getDb } from '../../../services/dexie/db';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';

async function getAssemblyProductIds(tenantId: string): Promise<Set<string>> {
  const db = getDb();
  let recipes = await db.recipes
    .where({ tenantId })
    .filter((r) => !r.deletedAt && r.isActive && r.mode === 'assembly')
    .toArray();

  // Si no hay recetas locales y estamos online, intentar desde Supabase
  if (recipes.length === 0 && navigator.onLine) {
    try {
      const uuid = await TenantTranslator.slugToUuid(tenantId);
      const { data } = await supabase
        .from('recipes')
        .select('*')
        .eq('tenant_id', uuid)
        .is('deleted_at', null);
      if (data) {
        for (const rec of data) {
          const localRecipe = {
            id: rec.id as string,
            tenantId,
            name: rec.name as string,
            productId: rec.product_id as string,
            mode: rec.mode as 'batch' | 'assembly',
            yieldQuantity: rec.yield_quantity as number,
            yieldUnit: rec.yield_unit as string,
            wastePct: rec.waste_pct ?? 0,
            isActive: rec.is_active !== undefined ? !!rec.is_active : true,
            notes: rec.notes as string | undefined,
            createdAt: rec.created_at ?? new Date().toISOString(),
            updatedAt: rec.updated_at ?? new Date().toISOString(),
          };
          await db.recipes.put(localRecipe);
        }
        // Recargar locales después de seedear
        recipes = await db.recipes
          .where({ tenantId })
          .filter((r) => !r.deletedAt && r.isActive && r.mode === 'assembly')
          .toArray();
      }
    } catch {
      // Fallback silencioso
    }
  }

  return new Set(recipes.map((r) => r.productId));
}

export const systemNotificationService = {
  async getLowStockProducts(tenantId: string) {
    const db = getDb();
    const assemblyIds = await getAssemblyProductIds(tenantId);
    const rows = await db.products
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => !p.deletedAt && !assemblyIds.has(p.id) && !!p.stockMin && p.stockMin > 0 && p.stock > 0 && p.stock <= p.stockMin)
      .toArray();

    if (rows.length === 0 && navigator.onLine) {
      try {
        const uuid = await TenantTranslator.slugToUuid(tenantId);
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', uuid)
          .is('deleted_at', null);
        if (data) {
          for (const p of data) {
            const pid = p.id as string;
            const stock = p.stock as number;
            const stockMin = p.stock_min as number;
            if (!assemblyIds.has(pid) && !!stockMin && stockMin > 0 && stock > 0 && stock <= stockMin) {
              rows.push({
                id: pid,
                tenantId,
                name: p.name as string,
                stock,
                stockMin,
                deletedAt: p.deleted_at ?? undefined,
              } as typeof rows[number]);
            }
          }
        }
      } catch {
        // Fallback silencioso
      }
    }

    return rows;
  },

  async getZeroStockProducts(tenantId: string) {
    const db = getDb();
    const assemblyIds = await getAssemblyProductIds(tenantId);
    const rows = await db.products
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => !p.deletedAt && !assemblyIds.has(p.id) && p.stock === 0)
      .toArray();

    if (rows.length === 0 && navigator.onLine) {
      try {
        const uuid = await TenantTranslator.slugToUuid(tenantId);
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', uuid)
          .is('deleted_at', null);
        if (data) {
          for (const p of data) {
            const pid = p.id as string;
            const stock = p.stock as number;
            if (!assemblyIds.has(pid) && stock === 0) {
              rows.push({
                id: pid,
                tenantId,
                name: p.name as string,
                stock,
                deletedAt: p.deleted_at ?? undefined,
              } as typeof rows[number]);
            }
          }
        }
      } catch {
        // Fallback silencioso
      }
    }

    return rows;
  },

  async getOpenCashRegister(tenantId: string) {
    const db = getDb();
    return db.cashRegisters
      .where('tenantId')
      .equals(tenantId)
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();
  },
};
