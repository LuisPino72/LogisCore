import Dexie, { type Table } from 'dexie';
import type { SyncQueueItem, SyncMeta } from '../sync/types';
import type { OutboxEntry } from '@logiscore/core';
import { logger } from '../../lib/logger';
import type {
  DexieTenantRef, DexieProductPresentation, DexieProduct,
  DexieCategory, DexieInventoryMovement, DexieInventoryLot,
  DexieSale, DexieSaleItem, DexieCashRegister, DexieRegisterConfig,
  DexieTenantSettings, DexieParkedCart, DexieProductFavorite,
  DexieProductImage, DexieExchangeRate, DexieAuditEntry,
  DexieSupplier, DexieCustomer, DexiePurchaseOrder, DexiePurchaseOrderItem,
  DexieNotification, DexieExpense, DexieRecipe, DexieRecipeLine,
  DexieProductionOrder, DexieRolePermission, DexieSupplierPayment, DexieCreditPayment,
  DexieImageLibrary, DexieDeliveryPerson, DexieUserPermissionOverride,
} from './types';

export class LogisCoreDB extends Dexie {
  tenantRefs!: Table<DexieTenantRef, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  syncMeta!: Table<SyncMeta, string>;
  outbox!: Table<OutboxEntry, number>;
  products!: Table<DexieProduct, string>;
  productPresentations!: Table<DexieProductPresentation, string>;
  categories!: Table<DexieCategory, string>;
  inventoryMovements!: Table<DexieInventoryMovement, string>;
  inventoryLots!: Table<DexieInventoryLot, string>;
  sales!: Table<DexieSale, string>;
  saleItems!: Table<DexieSaleItem, string>;
  cashRegisters!: Table<DexieCashRegister, string>;
  parkedCarts!: Table<DexieParkedCart, string>;
  productFavorites!: Table<DexieProductFavorite, [string, string]>;
  productImages!: Table<DexieProductImage, string>;
  suppliers!: Table<DexieSupplier, string>;
  customers!: Table<DexieCustomer, string>;
  purchaseOrders!: Table<DexiePurchaseOrder, string>;
  purchaseOrderItems!: Table<DexiePurchaseOrderItem, string>;
  exchangeRates!: Table<DexieExchangeRate, string>;
  auditEntries!: Table<DexieAuditEntry, number>;
  notifications!: Table<DexieNotification, string>;
  expenses!: Table<DexieExpense, string>;
  recipes!: Table<DexieRecipe, string>;
  recipeLines!: Table<DexieRecipeLine, string>;
  productionOrders!: Table<DexieProductionOrder, string>;
  rolePermissions!: Table<DexieRolePermission, string>;
  creditPayments!: Table<DexieCreditPayment, string>;
  supplierPayments!: Table<DexieSupplierPayment, string>;
  registerConfigs!: Table<DexieRegisterConfig, string>;
  tenantSettings!: Table<DexieTenantSettings, string>;
  imageLibrary!: Table<DexieImageLibrary, string>;
  deliveryPersons!: Table<DexieDeliveryPerson, string>;
  userPermissionOverrides!: Table<DexieUserPermissionOverride, string>;

  constructor(tenantSlug: string) {
    super(`LogisCore_${tenantSlug}`);
    this.version(17).stores({
      expenses: 'id, tenantId, category, date, status, nextDueDate, isRecurring, parentExpenseId, [tenantId+date], [tenantId+status], [tenantId+deletedAt], [tenantId+isRecurring]',
      exchangeRates: 'id, tenantId, createdAt',
      tenantRefs: 'id, slug, name',
      syncQueue: '++id, recordId, table, status, tenantId, nextRetryAt, createdAt, [tenantId+status], [recordId+table+status]',
      syncMeta: 'table',
      outbox: '++id, event, status, createdAt, nextRetryAt, [status+nextRetryAt]',
      products: 'id, tenantId, sku, categoryId, name, [tenantId+deletedAt]',
      productPresentations: 'id, tenantId, productId, name, [tenantId+deletedAt]',
      categories: 'id, tenantId, [tenantId+deletedAt]',
      inventoryMovements: 'id, tenantId, productId, type, createdAt, [productId+createdAt]',
      inventoryLots: 'id, tenantId, productId, remainingQuantity, createdAt, [productId+remainingQuantity]',
      sales: 'id, tenantId, [tenantId+deletedAt], [tenantId+createdAt], [tenantId+status+createdAt], customerId',
      saleItems: 'id, tenantId, saleId, productId, [tenantId+deletedAt], [saleId]',
      cashRegisters: 'id, tenantId, [tenantId+deletedAt]',
      parkedCarts: 'id, tenantId, [tenantId+createdAt]',
      productFavorites: '[productId+tenantId], tenantId',
      productImages: 'productId, tenantId, cachedAt',
      suppliers: 'id, tenantId, [tenantId+deletedAt]',
      customers: 'id, tenantId, name, [tenantId+deletedAt]',
      purchaseOrders: 'id, tenantId, supplierId, status, [tenantId+status], [tenantId+deletedAt]',
      purchaseOrderItems: 'id, tenantId, orderId, productId, [tenantId+orderId], [orderId]',
      auditEntries: '++id, eventName, status, createdAt, [status+createdAt]',
      notifications: 'id, tenantId, type, read, createdAt, [tenantId+read], [tenantId+deletedAt]',
      recipes: 'id, tenantId, productId, mode, isActive, [tenantId+deletedAt]',
      recipeLines: 'id, tenantId, recipeId, productId, [recipeId]',
      productionOrders: 'id, tenantId, recipeId, productId, status, [tenantId+status], [tenantId+deletedAt]',
    }).upgrade(() => Promise.resolve());
    this.version(18).stores({
      rolePermissions: 'id, role',
    }).upgrade(async (tx) => {
      const { migrateV17ToV18 } = await import('./migrations/v17-to-v18');
      await migrateV17ToV18({ rolePermissions: tx.table('rolePermissions') });
    });
    this.version(19).stores({
      suppliers: 'id, tenantId, rif, [tenantId+rif], [tenantId+deletedAt]',
    }).upgrade(async (tx) => {
      const { migrateV18ToV19 } = await import('./migrations/v18-to-v19');
      await migrateV18ToV19({ suppliers: tx.table('suppliers') });
    });
    this.version(20).stores({
      expenses: 'id, tenantId, category, date, status, nextDueDate, isRecurring, parentExpenseId, purchaseOrderId, [tenantId+date], [tenantId+status], [tenantId+deletedAt], [tenantId+isRecurring], &[parentExpenseId+date], [purchaseOrderId]',
    });
    this.version(21).stores({
      customers: 'id, tenantId, name, cedula, [tenantId+deletedAt]',
    });
    this.version(22).stores({
      creditPayments: 'id, tenantId, customerId, saleId, [tenantId+customerId], [tenantId+saleId]',
    });
    this.version(23).stores({
      purchaseOrderItems: 'id, tenantId, orderId, productId, [tenantId+orderId], [orderId]',
    });
    this.version(24).stores({});
    this.version(25).stores({});
    this.version(26).stores({
      inventoryMovements: 'id, tenantId, productId, type, createdAt, [productId+createdAt], productionOrderId',
    });
    this.version(27).stores({});
    this.version(28).stores({
      supplierPayments: 'id, tenantId, supplierId, purchaseOrderId, [tenantId+supplierId], [tenantId+purchaseOrderId]',
    }).upgrade(async (tx) => {
      const orders = await tx.table('purchaseOrders')
        .where('status')
        .anyOf('received', 'partially_received')
        .toArray();
      for (const order of orders) {
        const items = await tx.table('purchaseOrderItems')
          .where('orderId')
          .equals(order.id)
          .toArray();
        const totalUsd = items.reduce((sum, item) => sum + (item.totalUsd || 0), 0);
        await tx.table('purchaseOrders').update(order.id, {
          paymentStatus: 'paid',
          paidAmountUsd: totalUsd,
          paidAt: order.updatedAt || order.createdAt,
        });
      }
    });
    this.version(29).stores({
      registerConfigs: 'id, tenantId, [tenantId+name]',
      cashRegisters: 'id, tenantId, registerId, operatorId, isOpen, [tenantId+deletedAt], [tenantId+registerId+isOpen]',
    });
    this.version(30).stores({
      tenantSettings: 'tenantId, ivaRate, igtfRate, igtfEnabled',
    });
    this.version(31).stores({
      tenantSettings: 'tenantId',
    });
    this.version(32).stores({
      deliveryPersons: 'id, tenantId, phone, [tenantId+deletedAt]',
    });
    this.version(33).stores({
      parkedCarts: 'id, tenantId, [tenantId+createdAt], orderType',
    });
    this.version(34).stores({
      userPermissionOverrides: 'id, userId, tenantId, permission, [userId+tenantId]',
    });

  }
}

let dbInstance: LogisCoreDB | null = null;
let _dbClosing = false;

export function getDb(): LogisCoreDB {
  if (!dbInstance) {
    throw new Error('Dexie no inicializado. Llama a initDb(tenantSlug) primero.');
  }
  return dbInstance;
}

export function isDbReady(): boolean {
  return dbInstance !== null && !_dbClosing;
}

export function isDbClosing(): boolean {
  return _dbClosing;
}

export function setDbClosing(closing: boolean): void {
  _dbClosing = closing;
}

export function resetDbInstance(): void {
  dbInstance = null;
  _dbClosing = false;
}

export function initDb(tenantSlug: string): LogisCoreDB {
  if (dbInstance && dbInstance.name === `LogisCore_${tenantSlug}`) {
    return dbInstance;
  }
  if (dbInstance) {
    _dbClosing = true;
    dbInstance.close();
  }
  _dbClosing = false;
  dbInstance = new LogisCoreDB(tenantSlug);
  return dbInstance;
}

export async function destroyDb(): Promise<void> {
  if (dbInstance) {
    _dbClosing = true;
    const dbName = dbInstance.name;
    dbInstance.close();
    dbInstance = null;

    try {
      await Dexie.delete(dbName);
    } catch {
      logger.debug('[DbInstance]', 'destroyDb: first delete attempt failed, retrying...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        await Dexie.delete(dbName);
      } catch {
        logger.debug('[DbInstance]', 'destroyDb: second delete attempt failed, giving up');
      }
    }
  }
}
