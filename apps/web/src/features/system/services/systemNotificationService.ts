import { getDb } from '../../../services/dexie/db';

async function getAssemblyProductIds(tenantId: string): Promise<Set<string>> {
  const db = getDb();
  const recipes = await db.recipes
    .where({ tenantId })
    .filter((r) => !r.deletedAt && r.isActive && r.mode === 'assembly')
    .toArray();
  return new Set(recipes.map((r) => r.productId));
}

export const systemNotificationService = {
  async getLowStockProducts(tenantId: string) {
    const db = getDb();
    const assemblyIds = await getAssemblyProductIds(tenantId);
    const rows = await db.products
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => !p.deletedAt && !assemblyIds.has(p.id) && !!p.stockMin && p.stockMin > 0 && p.stock <= p.stockMin)
      .toArray();
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
