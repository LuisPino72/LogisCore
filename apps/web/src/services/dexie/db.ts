import Dexie, { type Table } from 'dexie';
import type { TenantInfo } from '@logiscore/core';

export interface DexieTenantRef extends TenantInfo {
  rif?: string;
}
import type { SyncQueueItem, SyncMeta } from '../sync/types';
import type { OutboxEntry } from '@logiscore/core';

export interface DexieProductPresentation {
  id: string;
  tenantId: string;
  productId: string;
  childProductId?: string;
  name: string;
  priceUsd: number;
  unitMultiplier: number;
  stockType: 'shared' | 'independent';
  barcode?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DexieProduct {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  priceUsd: number;
  categoryId?: string;
  isWeighted: boolean;
  isTaxable: boolean;
  isSellable?: boolean;
  unit: 'kg' | 'gr' | 'lt' | 'm' | 'unidad';
  stock: number;
  stockMin?: number;
  imageUrl?: string;
  deletedAt?: string;
}

export interface DexieCategory {
  id: string;
  tenantId: string;
  name: string;
  isPredefined?: boolean;
  deletedAt?: string;
}

export interface DexieInventoryMovement {
  id: string;
  tenantId: string;
  productId: string;
  userId: string;
  type: 'sale' | 'purchase' | 'adjustment';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  reasonType?: string;
  costUsd?: number;
  createdAt: string;
  deletedAt?: string;
}

export interface DexieInventoryLot {
  id: string;
  tenantId: string;
  productId: string;
  quantityAdded: number;
  remainingQuantity: number;
  costUsdPerUnit?: number;
  sourceMovementId?: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
  deletedAt?: string;
}

export interface DexieSale {
  id: string;
  tenantId: string;
  userId: string;
  paymentMethod: string;
  subtotalBs: number;
  igtfBs: number;
  ivaBs: number;
  totalBs: number;
  exchangeRate: number;
  status: string;
  voidedAt?: string;
  createdAt: string;
  deletedAt?: string;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  discountBs?: number;
}

export interface DexieSaleItem {
  id: string;
  tenantId: string;
  saleId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
  costUsdPerUnit?: number;
  isWeighted: boolean;
  unit: string;
  createdAt: string;
  deletedAt?: string;
  presentationId?: string;
  presentationName?: string;
  unitMultiplier: number;
  stockType?: 'shared' | 'independent';
}

export interface DexieCashRegister {
  id: string;
  tenantId: string;
  isOpen: boolean;
  openedBy: string | null;
  openedAt: string | null;
  openingBalanceBs: number | null;
  openingRate: number | null;
  closedBy: string | null;
  closedAt: string | null;
  closingBalanceBs: number | null;
  closingRate: number | null;
  expectedClosingBs: number | null;
  differenceBs: number | null;
  totalSalesCount: number;
  totalSalesBs: number;
  totalIgtfBs: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DexieParkedCart {
  id: string;
  tenantId: string;
  name: string;
  cartJson: string;
  createdAt: string;
}

export interface DexieProductFavorite {
  productId: string;
  tenantId: string;
  createdAt: string;
}

export interface DexieProductImage {
  productId: string;
  tenantId: string;
  imageUrl: string;
  data: ArrayBuffer;
  mimeType: string;
  cachedAt: string;
}

export interface DexieExchangeRate {
  id: string;
  tenantId: string;
  rate: number;
  source: 'bcv_api' | 'manual';
  fetchedAt: string | null;
  createdAt: string;
}

export interface DexieAuditEntry {
  id?: number;
  eventName: string;
  module: string;
  userId?: string;
  tenantId?: string;
  tenantUuid?: string | null;
  payload: string;
  severity: string;
  createdAt: string;
  status: 'pending' | 'synced';
  retryCount: number;
  error?: string;
}

export interface DexieSupplier {
  id: string;
  tenantId: string;
  name: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DexiePurchaseOrder {
  id: string;
  tenantId: string;
  supplierId: string;
  status: 'draft' | 'confirmed' | 'partially_received' | 'received' | 'cancelled';
  totalUsd: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DexiePurchaseOrderItem {
  id: string;
  orderId: string;
  tenantId: string;
  productId: string;
  presentationId?: string;
  unitMultiplier?: number;
  productName?: string;
  quantity: number;
  costUsdPerUnit: number;
  receivedQuantity: number;
  totalUsd: number;
  createdAt: string;
  deletedAt?: string;
}

export interface DexieNotification {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionPayload?: string;
  read: boolean;
  createdAt: string;
  deletedAt?: string;
}

export interface DexieExpense {
  id: string;
  tenantId: string;
  createdByUserId: string;
  category: string;
  amountUsd: number;
  exchangeRate: number;
  amountBs: number;
  description?: string;
  date: string;
  isRecurring: boolean;
  recurrenceType?: 'monthly' | 'yearly';
  nextDueDate?: string;
  parentExpenseId?: string;
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

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
  purchaseOrders!: Table<DexiePurchaseOrder, string>;
  purchaseOrderItems!: Table<DexiePurchaseOrderItem, string>;
  exchangeRates!: Table<DexieExchangeRate, string>;
  auditEntries!: Table<DexieAuditEntry, number>;
  notifications!: Table<DexieNotification, string>;
  expenses!: Table<DexieExpense, string>;

  constructor(tenantSlug: string) {
    super(`LogisCore_${tenantSlug}`);
    this.version(15).stores({
      expenses: 'id, tenantId, category, date, status, nextDueDate, isRecurring, parentExpenseId, [tenantId+date], [tenantId+status], [tenantId+deletedAt], [tenantId+isRecurring]',
      exchangeRates: 'id, tenantId, createdAt',
      tenantRefs: 'id, slug, name',
      syncQueue: '++id, table, status, tenantId, nextRetryAt, createdAt, [tenantId+status]',
      syncMeta: 'table',
      outbox: '++id, event, status, createdAt, nextRetryAt, [status+nextRetryAt]',
      products: 'id, tenantId, sku, categoryId, name, [tenantId+deletedAt]',
      productPresentations: 'id, tenantId, productId, childProductId, name, [tenantId+deletedAt]',
      categories: 'id, tenantId, [tenantId+deletedAt]',
      inventoryMovements: 'id, tenantId, productId, type, createdAt, [productId+createdAt]',
      inventoryLots: 'id, tenantId, productId, remainingQuantity, createdAt, [productId+remainingQuantity]',
      sales: 'id, tenantId, [tenantId+deletedAt], [tenantId+createdAt]',
      saleItems: 'id, tenantId, saleId, productId, [tenantId+deletedAt], [saleId]',
      cashRegisters: 'id, tenantId, [tenantId+deletedAt]',
      parkedCarts: 'id, tenantId, [tenantId+createdAt]',
      productFavorites: '[productId+tenantId], tenantId',
      productImages: 'productId, tenantId, cachedAt',
      suppliers: 'id, tenantId, [tenantId+deletedAt]',
      purchaseOrders: 'id, tenantId, supplierId, status, [tenantId+status], [tenantId+deletedAt]',
      purchaseOrderItems: 'id, orderId, productId, [orderId]',
      auditEntries: '++id, eventName, status, createdAt, [status+createdAt]',
      notifications: 'id, tenantId, type, read, createdAt, [tenantId+read], [tenantId+deletedAt]',
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
      // Si falla el delete (blocked), reintentar después de un segundo
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        await Dexie.delete(dbName);
      } catch {
        // Si sigue bloqueado, el SW cerrará la conexión eventualmente
      }
    }
  }
}
