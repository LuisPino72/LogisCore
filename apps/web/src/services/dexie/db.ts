import Dexie from 'dexie';

Dexie.debug = false;

export type {
  DexieTenantRef,
  DexieProductPresentation,
  DexieProduct,
  DexieCategory,
  DexieInventoryMovement,
  DexieInventoryLot,
  DexieSale,
  DexieSaleItem,
  DexieCashRegister,
  DexieRegisterConfig,
  DexieTenantSettings,
  DexieParkedCart,
  DexieProductFavorite,
  DexieProductImage,
  DexieExchangeRate,
  DexieAuditEntry,
  DexieSupplier,
  DexieCustomer,
  DexiePurchaseOrder,
  DexiePurchaseOrderItem,
  DexieNotification,
  DexieExpense,
  DexieRecipe,
  DexieRecipeLine,
  DexieProductionOrder,
  DexieRolePermission,
  DexieSupplierPayment,
  DexieCreditPayment,
} from './types';

export type { SyncQueueItem, SyncMeta } from '../sync/types';
export type { OutboxEntry } from '@logiscore/core';

export { LogisCoreDB, getDb, isDbReady, isDbClosing, setDbClosing, resetDbInstance, initDb, destroyDb } from './dbInstance';
