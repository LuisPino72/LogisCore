import { useEffect, useRef } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useNotificationStore } from '../../../stores/notificationStore';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import { systemNotificationService } from '../services/systemNotificationService';

const HIGH_SALE_THRESHOLD_USD = 100;

async function checkLowStock(tenantId: string): Promise<void> {
  try {
    const lowStock = await systemNotificationService.getLowStockProducts(tenantId);
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
    const agotados = await systemNotificationService.getZeroStockProducts(tenantId);
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
    if (hour !== 23) return;

    const openReg = await systemNotificationService.getOpenCashRegister(tenantId);
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
        const rate = useExchangeRateStore.getState().rate ?? 1;
        const totalUsd = data.totalBs / rate;
        if (totalUsd < HIGH_SALE_THRESHOLD_USD) return;

        store.addNotification({
          type: 'venta_alta',
          title: 'Venta alta',
          message: `Venta #${data.saleId.slice(0, 8)} — $${totalUsd.toFixed(2)} USD`,
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
