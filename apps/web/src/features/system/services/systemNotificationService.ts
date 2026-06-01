import { getDb } from '../../../services/dexie/db';

export const systemNotificationService = {
  async getLowStockProducts(tenantId: string) {
    const db = getDb();
    return db.products
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => !p.deletedAt && !!p.stockMin && p.stockMin > 0 && p.stock <= p.stockMin)
      .toArray();
  },

  async getZeroStockProducts(tenantId: string) {
    const db = getDb();
    return db.products
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => !p.deletedAt && p.stock === 0)
      .toArray();
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
