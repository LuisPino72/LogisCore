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
  CORE_BOOTSTRAP_COMPLETED: 'CORE.BOOTSTRAP_COMPLETED',
} as const;