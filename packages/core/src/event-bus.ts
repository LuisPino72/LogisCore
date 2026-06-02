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
  SALE_COMPLETED: 'SALE.COMPLETED',
  BOX_OPENED: 'POS.BOX_OPENED',
  BOX_CLOSED: 'POS.BOX_CLOSED',
  INVENTORY_UPDATED: 'INVENTORY.UPDATED',
  SYNC_REFRESH_TABLE: 'SYNC.REFRESH_TABLE',
  SYNC_BATCH_STARTED: 'SYNC.BATCH_STARTED',
  SYNC_BATCH_COMPLETED: 'SYNC.BATCH_COMPLETED',
  SYNC_CONFLICT_DETECTED: 'SYNC.CONFLICT_DETECTED',
  SYNC_ERROR: 'SYNC.ERROR',
  USER_LOGIN: 'USER.LOGIN',
  USER_LOGOUT: 'USER.LOGOUT',
  CORE_BOOTSTRAP_COMPLETED: 'CORE.BOOTSTRAP_COMPLETED',
  ADMIN_NAVIGATE_TENANT: 'ADMIN.NAVIGATE_TENANT',
  ADMIN_EXIT_TENANT: 'ADMIN.EXIT_TENANT',
  EXCHANGE_RATE_UPDATED: 'EXCHANGE.RATE_UPDATED',
  PRODUCTION_COMPLETED: 'PRODUCTION.COMPLETED',
  EXPENSES_CREATED: 'EXPENSES.CREATED',
  EXPENSES_UPDATED: 'EXPENSES.UPDATED',
  EXPENSES_DELETED: 'EXPENSES.DELETED',
  CUSTOMER_CREATED: 'CUSTOMER.CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER.UPDATED',
  CUSTOMER_DELETED: 'CUSTOMER.DELETED',
} as const;
