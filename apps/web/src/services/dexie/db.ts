import Dexie, { type Table } from 'dexie';
import type { TenantInfo } from '@logiscore/core';
import type { PaymentMethod } from '../../specs/pos';

// Deshabilitar logs de Dexie (Dexie: read products, etc.)
Dexie.debug = false;

export interface DexieTenantRef extends TenantInfo {
  rif?: string;
  direccion?: string;
  telefono?: string;
  logoUrl?: string;
}
import type { SyncQueueItem, SyncMeta } from '../sync/types';
import type { OutboxEntry } from '@logiscore/core';

export interface DexieProductPresentation {
  id: string;
  tenantId: string;
  productId: string;
  childProductId?: string | null;
  name: string;
  priceUsd: number;
  unitMultiplier: number;
  stockType: 'shared';
  barcode?: string | null;
  sortOrder: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface DexieProduct {
  id: string;
  tenantId: string;
  name: string;
  sku: string | null;
  priceUsd: number;
  categoryId?: string | null;
  isWeighted: boolean;
  isTaxable: boolean;
  isSellable?: boolean;
  unit: 'kg' | 'gr' | 'lt' | 'm' | 'unidad';
  stock: number;
  stockInCarts?: number;
  stockMin?: number | null;
  imageUrl?: string | null;
  costPrice?: number | null;
  productType?: 'resale' | 'materia_prima' | 'producto_terminado' | 'both';
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface DexieCategory {
  id: string;
  tenantId: string | null;
  name: string;
  isPredefined?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface DexieInventoryMovement {
  id: string;
  tenantId: string;
  productId: string;
  userId: string;
  type: 'sale' | 'purchase' | 'adjustment' | 'production_output' | 'production_consumption';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  reasonType?: string;
  costUsd?: number;
  productionOrderId?: string; // FUGA-3
  consumedLots?: string; // FUGA-3
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
  version: number;
  deletedAt?: string;
}

export interface DexieSale {
  id: string;
  tenantId: string;
  userId: string;
  paymentMethod: PaymentMethod;
  subtotalBs: number;
  igtfBs: number;
  ivaBs: number;
  totalBs: number;
  exchangeRate: number;
  status: 'completed' | 'voided';
  voidedAt?: string;
  createdAt: string;
  deletedAt?: string;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  discountBs?: number;
  customerId?: string;
  // POS-002 (C-6): montos en USD persistidos
  subtotalUsd: number;
  ivaUsd: number;
  igtfUsd: number;
  totalUsd: number;
  discountUsd?: number;
  // MED-10: FK a cashRegister para voidSale preciso
  cashRegisterId?: string;
  // Sistema de crédito (fiado)
  isCreditSale?: boolean;
  creditCollected?: boolean;
  collectedAt?: string;
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
  // AUDIT-012: FIFO restore (track original lot consumption)
  consumedLots?: Array<{ lotId: string; quantity: number }>;
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
  collectedDebtBs: number; // FUGA-1: Cobros de deuda acumulados en caja
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // POS-002 (M-1): acepta null también para alinear con schema
}

export interface DexieParkedCart {
  id: string;
  tenantId: string;
  name: string;
  cartJson: string;
  customerId?: string;
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
  rif?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DexieCustomer {
  id: string;
  tenantId: string;
  name: string;
  phone?: string;
  cedula?: string; // AUDIT-017: Cédula field V/E/J/P + 6-8 digits
  address?: string;
  creditLimit: number;
  balance: number;
  notes?: string;
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
  // PLAN-113 (C2): FK a purchase_orders para idempotencia de COMPRA_INVENTARIO
  purchaseOrderId?: string;
}

export interface DexieRecipe {
  id: string;
  tenantId: string;
  name: string;
  productId: string;
  mode: 'batch' | 'assembly';
  yieldQuantity: number;
  yieldUnit: string;
  wastePct: number;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DexieRecipeLine {
  id: string;
  tenantId: string;
  recipeId: string;
  productId: string;
  quantity: number;
  unit: string;
  sortOrder: number;
  createdAt: string;
  deletedAt?: string;
}

export interface DexieProductionOrder {
  id: string;
  tenantId: string;
  recipeId: string;
  productId: string;
  batchCount: number;
  quantityTarget: number;
  quantityProduced: number;
  status: 'draft' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';
  plannedDate?: string;
  startedAt?: string;
  completedAt?: string;
  wasteNotes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  totalCost?: number;
  costPerUnit?: number;
}

// BACKLOG-106 [AUTH-002]: Tabla rolePermissions (modelo simplificado Owner/Admin/Employee)
export interface DexieRolePermission {
  id: string;
  role: 'owner' | 'admin' | 'employee';
  modules: string[];
  createdAt: string;
}

export interface DexieCreditPayment {
  id: string;
  tenantId: string;
  customerId: string;
  saleId: string;
  amountUsd: number;
  amountBs: number;
  paymentMethod: PaymentMethod;
  exchangeRate: number;
  reference?: string;
  createdAt: string;
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
      sales: 'id, tenantId, [tenantId+deletedAt], [tenantId+createdAt], customerId',
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
    }).upgrade(() => {
      // Preservar datos existentes durante upgrade — no destruir nada
      // Dexie recrea tablas con nuevos índices pero preserva los datos
      return Promise.resolve();
    });
    // BACKLOG-106 [AUTH-002]: Migración v17 → v18 — tabla rolePermissions
    this.version(18).stores({
      rolePermissions: 'id, role',
    }).upgrade(async (tx) => {
      const { migrateV17ToV18 } = await import('./migrations/v17-to-v18');
      await migrateV17ToV18({ rolePermissions: tx.table('rolePermissions') });
    });
    // BACKLOG-106 [PURCHASES-001]: Migración v18 → v19 — índice rif en suppliers
    // Campo rif agregado a DexieSupplier; índice único por tenant (rif + deletedAt IS NULL)
    this.version(19).stores({
      suppliers: 'id, tenantId, rif, [tenantId+rif], [tenantId+deletedAt]',
    }).upgrade(async (tx) => {
      const { migrateV18ToV19 } = await import('./migrations/v18-to-v19');
      await migrateV18ToV19({ suppliers: tx.table('suppliers') });
    });
    // BACKLOG-100 (PLAN-113 C2+C6): Migración v19 → v20 — purchaseOrderId en expenses
    // + unique [parentExpenseId+date] para idempotencia de recurring instances.
    this.version(20).stores({
      expenses: 'id, tenantId, category, date, status, nextDueDate, isRecurring, parentExpenseId, purchaseOrderId, [tenantId+date], [tenantId+status], [tenantId+deletedAt], [tenantId+isRecurring], &[parentExpenseId+date], [purchaseOrderId]',
    });
    // PLAN-112 (M2): Migración v20 → v21 — índice cedula en customers para O(1)
    // lookup de duplicados. Antes era O(n) con .where({tenantId}).filter().
    this.version(21).stores({
      // Solo agregamos `cedula` (non-unique) como índice secundario. El chequeo de
      // duplicado se hace dentro de la tx en customerService (M2). Usar `&cedula`
      // como unique NO funciona porque (a) cedula es opcional y (b) queremos
      // soft-deleted viejos + reactivación. El index acelera el lookup, la tx
      // serializa races.
      customers: 'id, tenantId, name, cedula, [tenantId+deletedAt]',
    });
    // Sistema de crédito (fiado) — v22: nueva tabla creditPayments
    this.version(22).stores({
      creditPayments: 'id, tenantId, customerId, saleId, [tenantId+customerId], [tenantId+saleId]',
    });
    // [PURCHASES-001]: v23 — agregar tenantId index a purchaseOrderItems
    // Fix: getPriceHistory() usa .where({ tenantId }) pero tenantId no estaba indexado
    this.version(23).stores({
      purchaseOrderItems: 'id, tenantId, orderId, productId, [tenantId+orderId], [orderId]',
    });
    // PLAN-PRODUCTION-COST: v24 — add totalCost, costPerUnit to productionOrders (no index needed)
    this.version(24).stores({});
    // FUGA-1: v25 — add collectedDebtBs to cashRegisters (no index needed, default 0)
    this.version(25).stores({});
    // MED-4: v26 — add productionOrderId index to inventoryMovements
    this.version(26).stores({
      inventoryMovements: 'id, tenantId, productId, type, createdAt, [productId+createdAt], productionOrderId',
    });
    // MED-10: v27 — add cashRegisterId to sales (no new index needed, queried by tenantId+id)
    this.version(27).stores({});
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
