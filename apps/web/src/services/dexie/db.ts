import Dexie from 'dexie';

Dexie.debug = false;

// TECH DEBT: barrel exports — cada re-export fuerza TypeScript a cargar todos los
// tipos del módulo fuente aunque solo se necesite uno. A medida que crezca el schema,
// conviene migrar a imports directos desde './types' y './sync/types' en cada consumer.
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
  DexieImageLibrary,
  DexieDeliveryPerson,
  OrderStatus,
} from './types';

export type { SyncQueueItem, SyncMeta } from '../sync/types';
export type { OutboxEntry } from '@logiscore/core';

export { LogisCoreDB, getDb, isDbReady, isDbClosing, setDbClosing, resetDbInstance, initDb, destroyDb } from './dbInstance';
