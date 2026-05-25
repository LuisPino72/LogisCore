import { useEffect, useRef } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { getDb } from '../../../services/dexie/db';
import { useNotificationStore } from '../../../stores/notificationStore';

const HIGH_SALE_THRESHOLD_BS = 5000;

async function checkLowStock(tenantId: string): Promise<void> {
  try {
    const db = getDb();
    const lowStock = await db.products
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => !p.deletedAt && !!p.stockMin && p.stockMin > 0 && p.stock <= p.stockMin)
      .toArray();

    for (const product of lowStock) {
      await useNotificationStore.getState().addNotification({
        type: 'low_stock',
        title: 'Stock crítico',
        message: `${product.name} — ${product.stock} ${product.unit} (mín: ${product.stockMin})`,
      });
    }
  } catch {
    // silencioso
  }
}

async function checkLowStockZero(tenantId: string): Promise<void> {
  try {
    const db = getDb();
    const agotados = await db.products
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => !p.deletedAt && p.stock === 0)
      .toArray();

    for (const product of agotados) {
      await useNotificationStore.getState().addNotification({
        type: 'product_agotado',
        title: 'Producto agotado',
        message: `${product.name} — sin stock disponible`,
      });
    }
  } catch {
    // silencioso
  }
}

async function checkOpenRegister(tenantId: string): Promise<void> {
  try {
    const now = new Date();
    const hour = now.getHours();
    if (hour < 21) return;

    const db = getDb();
    const openReg = await db.cashRegisters
      .where('tenantId')
      .equals(tenantId)
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();

    if (openReg) {
      await useNotificationStore.getState().addNotification({
        type: 'open_register',
        title: 'Caja abierta',
        message: `Hay una caja abierta desde las ${new Date(openReg.openedAt!).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}. Ciérrala antes de irte.`,
      });
    }
  } catch {
    // silencioso
  }
}

export function useSystemNotifications(tenantId: string | null, role: string | null): void {
  const notifiedSales = useRef(new Set<string>());

  useEffect(() => {
    if (!tenantId || !role || role === 'employee') return;

    const store = useNotificationStore.getState();
    store.setTenantId(tenantId);

    if (!store.loaded) {
      store.loadNotifications(tenantId);
    }

    checkLowStock(tenantId);
    checkLowStockZero(tenantId);
    checkOpenRegister(tenantId);

    const subs: ReturnType<typeof EventBus.on>[] = [];

    subs.push(
      EventBus.on('SALE.VOIDED', (payload: unknown) => {
        const data = payload as { saleId?: string };
        if (!data.saleId || notifiedSales.current.has(data.saleId)) return;
        notifiedSales.current.add(data.saleId);

        store.addNotification({
          type: 'sale_voided',
          title: 'Venta anulada',
          message: `Se anuló la venta #${data.saleId.slice(0, 8)}`,
        });
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.SALE_COMPLETED, (payload: unknown) => {
        const data = payload as { saleId?: string; totalBs?: number };
        if (!data.saleId || !data.totalBs) return;
        if (data.totalBs < HIGH_SALE_THRESHOLD_BS) return;

        store.addNotification({
          type: 'venta_alta',
          title: 'Venta alta',
          message: `Venta #${data.saleId.slice(0, 8)} — ${data.totalBs.toFixed(2)} Bs`,
        });
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.EXCHANGE_RATE_UPDATED, (payload: unknown) => {
        const data = payload as { rate?: number; source?: string };
        if (!data.rate) return;

        store.addNotification({
          type: 'tasa_actualizada',
          title: 'Tasa actualizada',
          message: `Nueva tasa: ${data.rate.toFixed(2)} Bs/USD (${data.source === 'manual' ? 'Manual' : 'BCV'})`,
        });
      }),
    );

    return () => subs.forEach((s) => EventBus.off(s));
  }, [tenantId, role]);
}
