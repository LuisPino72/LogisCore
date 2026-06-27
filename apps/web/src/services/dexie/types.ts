import type { TenantInfo } from '@logiscore/core';
import type { PaymentMethod } from '../../specs/pos';

export interface DexieTenantRef extends TenantInfo {
  rif?: string;
  direccion?: string;
  telefono?: string;
  logoUrl?: string;
}

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
  isIngredient?: boolean;
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
  defaultImageUrl?: string | null;
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
  productionOrderId?: string;
  consumedLots?: string;
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

export type OrderStatus =
  | 'completed' | 'voided'
  | 'pedida' | 'preparacion' | 'lista'
  | 'pagada' | 'despachada' | 'entregada' | 'cancelada';

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
  status: OrderStatus;
  voidedAt?: string;
  createdAt: string;
  deletedAt?: string;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  discountBs?: number;
  customerId?: string;
  subtotalUsd: number;
  ivaUsd: number;
  igtfUsd: number;
  totalUsd: number;
  discountUsd?: number;
  cashRegisterId?: string;
  isCreditSale?: boolean;
  creditCollected?: boolean;
  collectedAt?: string;
  orderType?: 'delivery';
  needsKitchen?: boolean;
  isUrgent?: boolean;
  kitchenNotes?: string;
  orderNumber?: string;
  deliveryPersonName?: string;
  deliveryFee?: number;
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryNotes?: string;
  paidAt?: string;
  preparedAt?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  modifiedAt?: string;
  modificationCount?: number;
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
  collectedDebtBs: number;
  registerId?: string;
  operatorId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface DexieRegisterConfig {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface DexieTenantSettings {
  tenantId: string;
  ivaRate: number;
  igtfRate: number;
  igtfEnabled: boolean;
  maxDiscountPct: number;
  defaultMinStock: number;
  defaultCreditLimit: number;
  mandatoryCustomerId: boolean;
  lowStockThreshold: number;
  ticketFooterMessage: string;
  updatedAt: string;
  pagoMovilEnabled?: boolean;
  pagoMovilBank?: string;
  pagoMovilHolder?: string;
  pagoMovilId?: string;
  pagoMovilPhone?: string;
  needsKitchenDefault?: boolean;
  defaultDeliveryFee?: number;
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
  balance: number;
  creditLimit?: number;
  notes?: string;
  address?: string;
  paymentTerms?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DexieCustomer {
  id: string;
  tenantId: string;
  name: string;
  phone?: string;
  cedula?: string;
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
  paymentStatus?: string;
  dueDate?: string;
  paidAt?: string;
  paidAmountUsd?: number;
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
  purchaseOrderId?: string;
  saleId?: string;
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

export interface DexieRolePermission {
  id: string;
  role: 'owner' | 'admin' | 'employee';
  modules: string[];
  createdAt: string;
}

export interface DexieSupplierPayment {
  id: string;
  tenantId: string;
  supplierId: string;
  purchaseOrderId: string;
  amountUsd: number;
  amountBs: number;
  paymentMethod: string;
  exchangeRate: number;
  reference?: string;
  notes?: string;
  createdAt: string;
  deletedAt?: string;
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

export interface DexieImageLibrary {
  id: string;
  tenantId: string | null;
  name: string;
  categoryId: string | null;
  imageUrl: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DexieDeliveryPerson {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  deletedAt?: string;
}
