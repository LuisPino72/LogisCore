/** EventBus: Comunicación desacoplada entre módulos (Regla de Oro #4). */

type Listener = (payload: unknown) => void;

interface Subscription {
  event: string;
  listener: Listener;
}

class EventBusImpl {
  private listeners = new Map<string, Set<Listener>>();

  emit(event: string, payload: unknown = {}): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`[EventBus] Error en listener de ${event}:`, err);
      }
    }
  }

  on(event: string, listener: Listener): Subscription {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return { event, listener };
  }

  off(subscription: Subscription): void {
    const listeners = this.listeners.get(subscription.event);
    if (!listeners) return;
    listeners.delete(subscription.listener);
    if (listeners.size === 0) {
      this.listeners.delete(subscription.event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const EventBus = new EventBusImpl();

/** Dominios de eventos del sistema */
export const SystemEvents = {
  // POS / Ventas
  SALE_COMPLETED: 'SALE.COMPLETED',
  SALE_VOIDED: 'SALE.VOIDED',
  BOX_OPENED: 'POS.BOX_OPENED',
  BOX_CLOSED: 'POS.BOX_CLOSED',
  CART_ADD_ANIMATION: 'CART.ADD_ANIMATION',
  ORDER_CREATED: 'ORDER.CREATED',
  ORDER_STATUS_CHANGED: 'ORDER.STATUS_CHANGED',
  ORDER_DELIVERED: 'ORDER.DELIVERED',
  ORDER_CANCELLED: 'ORDER.CANCELLED',

  // Inventario
  INVENTORY_CREATED: 'INVENTORY.CREATED',
  INVENTORY_UPDATED: 'INVENTORY.UPDATED',
  INVENTORY_DELETED: 'INVENTORY.DELETED',
  INVENTORY_ADJUSTMENT: 'INVENTORY.ADJUSTMENT',
  INVENTORY_PRODUCT_CREATED: 'INVENTORY.PRODUCT_CREATED',
  IMAGE_LIBRARY_CREATED: 'IMAGE_LIBRARY.CREATED',
  IMAGE_LIBRARY_DELETED: 'IMAGE_LIBRARY.DELETED',

  // Compras
  PURCHASE_CREATED: 'PURCHASE.CREATED',
  PURCHASE_UPDATED: 'PURCHASE.UPDATED',
  PURCHASE_DELETED: 'PURCHASE.DELETED',
  PURCHASE_CONFIRMED: 'PURCHASE.CONFIRMED',
  PURCHASE_RECEIVED: 'PURCHASE.RECEIVED',
  PURCHASE_CANCELLED: 'PURCHASE.CANCELLED',
  PURCHASE_SUPPLIER_CREATED: 'PURCHASE.SUPPLIER_CREATED',
  PURCHASE_SUPPLIER_UPDATED: 'PURCHASE.SUPPLIER_UPDATED',
  PURCHASE_SUPPLIER_DELETED: 'PURCHASE.SUPPLIER_DELETED',
  SUPPLIER_PAYMENT_CREATED: 'SUPPLIER.PAYMENT_CREATED',

  // Producción
  PRODUCTION_COMPLETED: 'PRODUCTION.COMPLETED',
  PRODUCTION_RECIPE_CREATED: 'PRODUCTION.RECIPE_CREATED',
  PRODUCTION_UPDATED: 'PRODUCTION.UPDATED',
  PRODUCTION_DELETED: 'PRODUCTION.DELETED',
  PRODUCTION_ORDER_CANCELLED: 'PRODUCTION.ORDER_CANCELLED',
  PRODUCTION_ASSEMBLY_CONSUMED: 'PRODUCTION.ASSEMBLY_CONSUMED',

  // Gastos
  EXPENSES_CREATED: 'EXPENSES.CREATED',
  EXPENSES_UPDATED: 'EXPENSES.UPDATED',
  EXPENSES_DELETED: 'EXPENSES.DELETED',
  EXPENSES_CANCELLED: 'EXPENSES.CANCELLED',
  EXPENSES_RECURRING_GENERATED: 'EXPENSES.RECURRING_GENERATED',

  // Clientes
  CUSTOMER_CREATED: 'CUSTOMER.CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER.UPDATED',
  CUSTOMER_DELETED: 'CUSTOMER.DELETED',
  DEBT_COLLECTED: 'DEBT.COLLECTED',

  // Exchange
  EXCHANGE_RATE_UPDATED: 'EXCHANGE.RATE_UPDATED',
  EXCHANGE_RATE_STALE: 'EXCHANGE.RATE_STALE',
  EXCHANGE_RATE_FAILED: 'EXCHANGE.RATE_FAILED',

  // Sync
  SYNC_REFRESH_TABLE: 'SYNC.REFRESH_TABLE',

  // Auth
  USER_LOGIN: 'USER.LOGIN',
  USER_LOGOUT: 'USER.LOGOUT',
  USER_PASSWORD_CHANGED: 'USER.PASSWORD_CHANGED',

  // Admin
  ADMIN_NAVIGATE_TENANT: 'ADMIN.NAVIGATE_TENANT',
  ADMIN_EXIT_TENANT: 'ADMIN.EXIT_TENANT',
  ADMIN_TENANT_CREATE: 'ADMIN.TENANT.CREATE',
  ADMIN_TENANT_DELETE: 'ADMIN.TENANT.DELETE',
  ADMIN_TENANT_HARD_DELETE: 'ADMIN.TENANT.HARD_DELETE',
  ADMIN_ROLE_CREATE: 'ADMIN.ROLE.CREATE',

  // Settings
  SETTINGS_FISCAL_UPDATED: 'SETTINGS.FISCAL.UPDATED',
  SETTINGS_OPERATIONS_UPDATED: 'SETTINGS.OPERATIONS.UPDATED',
  SETTINGS_BUSINESS_UPDATED: 'SETTINGS.BUSINESS.UPDATED',

  // Sistema
  AUDIT_FAILED: 'AUDIT.FAILED',
} as const;

/** Mapa de tipos de payload por evento (compile-time safety) */
export interface EventPayloadMap {
  [SystemEvents.SALE_COMPLETED]: { saleId: string; totalBs?: number; [key: string]: unknown };
  [SystemEvents.SALE_VOIDED]: { saleId: string; [key: string]: unknown };
  [SystemEvents.BOX_OPENED]: { registerId: string; [key: string]: unknown };
  [SystemEvents.BOX_CLOSED]: { registerId: string; [key: string]: unknown };
  [SystemEvents.CART_ADD_ANIMATION]: Record<string, unknown>;
  [SystemEvents.ORDER_CREATED]: { saleId: string; customerId?: string; customerName?: string; items: Array<{ name: string; qty: number }>; needsKitchen: boolean; orderType: string; [key: string]: unknown };
  [SystemEvents.ORDER_STATUS_CHANGED]: { saleId: string; oldStatus: string; newStatus: string; modified?: boolean; reverted?: boolean; [key: string]: unknown };
  [SystemEvents.ORDER_DELIVERED]: { saleId: string; deliveryPersonName: string; [key: string]: unknown };
  [SystemEvents.ORDER_CANCELLED]: { saleId: string; [key: string]: unknown };
  [SystemEvents.INVENTORY_CREATED]: Record<string, unknown>;
  [SystemEvents.INVENTORY_UPDATED]: Record<string, unknown>;
  [SystemEvents.INVENTORY_DELETED]: Record<string, unknown>;
  [SystemEvents.INVENTORY_ADJUSTMENT]: Record<string, unknown>;
  [SystemEvents.INVENTORY_PRODUCT_CREATED]: Record<string, unknown>;
  [SystemEvents.IMAGE_LIBRARY_CREATED]: Record<string, unknown>;
  [SystemEvents.IMAGE_LIBRARY_DELETED]: Record<string, unknown>;
  [SystemEvents.PURCHASE_CREATED]: Record<string, unknown>;
  [SystemEvents.PURCHASE_UPDATED]: Record<string, unknown>;
  [SystemEvents.PURCHASE_DELETED]: Record<string, unknown>;
  [SystemEvents.PURCHASE_CONFIRMED]: Record<string, unknown>;
  [SystemEvents.PURCHASE_RECEIVED]: { orderId: string; [key: string]: unknown };
  [SystemEvents.PURCHASE_CANCELLED]: Record<string, unknown>;
  [SystemEvents.PURCHASE_SUPPLIER_CREATED]: Record<string, unknown>;
  [SystemEvents.PURCHASE_SUPPLIER_UPDATED]: Record<string, unknown>;
  [SystemEvents.PURCHASE_SUPPLIER_DELETED]: Record<string, unknown>;
  [SystemEvents.SUPPLIER_PAYMENT_CREATED]: Record<string, unknown>;
  [SystemEvents.PRODUCTION_COMPLETED]: Record<string, unknown>;
  [SystemEvents.PRODUCTION_RECIPE_CREATED]: Record<string, unknown>;
  [SystemEvents.PRODUCTION_UPDATED]: Record<string, unknown>;
  [SystemEvents.PRODUCTION_DELETED]: Record<string, unknown>;
  [SystemEvents.PRODUCTION_ORDER_CANCELLED]: Record<string, unknown>;
  [SystemEvents.PRODUCTION_ASSEMBLY_CONSUMED]: Record<string, unknown>;
  [SystemEvents.EXPENSES_CREATED]: Record<string, unknown>;
  [SystemEvents.EXPENSES_UPDATED]: Record<string, unknown>;
  [SystemEvents.EXPENSES_DELETED]: Record<string, unknown>;
  [SystemEvents.EXPENSES_CANCELLED]: Record<string, unknown>;
  [SystemEvents.EXPENSES_RECURRING_GENERATED]: Record<string, unknown>;
  [SystemEvents.CUSTOMER_CREATED]: Record<string, unknown>;
  [SystemEvents.CUSTOMER_UPDATED]: Record<string, unknown>;
  [SystemEvents.CUSTOMER_DELETED]: Record<string, unknown>;
  [SystemEvents.DEBT_COLLECTED]: Record<string, unknown>;
  [SystemEvents.EXCHANGE_RATE_UPDATED]: Record<string, unknown>;
  [SystemEvents.EXCHANGE_RATE_STALE]: Record<string, unknown>;
  [SystemEvents.EXCHANGE_RATE_FAILED]: Record<string, unknown>;
  [SystemEvents.SYNC_REFRESH_TABLE]: { table: string; [key: string]: unknown };
  [SystemEvents.USER_LOGIN]: Record<string, unknown>;
  [SystemEvents.USER_LOGOUT]: Record<string, unknown>;
  [SystemEvents.USER_PASSWORD_CHANGED]: Record<string, unknown>;
  [SystemEvents.ADMIN_NAVIGATE_TENANT]: { tenantSlug: string; [key: string]: unknown };
  [SystemEvents.ADMIN_EXIT_TENANT]: Record<string, unknown>;
  [SystemEvents.ADMIN_TENANT_CREATE]: Record<string, unknown>;
  [SystemEvents.ADMIN_TENANT_DELETE]: Record<string, unknown>;
  [SystemEvents.ADMIN_TENANT_HARD_DELETE]: Record<string, unknown>;
  [SystemEvents.ADMIN_ROLE_CREATE]: Record<string, unknown>;
  [SystemEvents.SETTINGS_FISCAL_UPDATED]: Record<string, unknown>;
  [SystemEvents.SETTINGS_OPERATIONS_UPDATED]: Record<string, unknown>;
  [SystemEvents.SETTINGS_BUSINESS_UPDATED]: Record<string, unknown>;
  [SystemEvents.AUDIT_FAILED]: Record<string, unknown>;
}
