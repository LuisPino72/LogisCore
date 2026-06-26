import { useEffect, useRef } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useNotificationStore } from '../../../stores/notificationStore';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import { systemNotificationService } from '../services/systemNotificationService';
import { displayStock } from '../../inventory/types';

const HIGH_SALE_THRESHOLD_USD = 100;

async function checkLowStock(tenantId: string): Promise<void> {
  try {
    const lowStock = await systemNotificationService.getLowStockProducts(tenantId);
    for (const product of lowStock) {
      await useNotificationStore.getState().addNotification({
        type: 'low_stock',
        title: 'Stock crítico',
        message: `${product.name} — ${displayStock(product.stock, product.unit)} ${product.unit} (mín: ${displayStock(product.stockMin!, product.unit)})`,
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
  // Refs para evitar checks duplicados cuando el componente se re-monta
  // (React StrictMode en dev monta/desmonta 2 veces).
  const stockCheckedFor = useRef<string | null>(null);
  const zeroStockCheckedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!tenantId || !role || role === 'employee') return;

    const store = useNotificationStore.getState();
    store.setTenantId(tenantId);

    if (!store.loaded) {
      store.loadNotifications(tenantId);
    }

    // Solo chequear stock UNA VEZ por tenantId (no en cada re-mount).
    // Además, addNotification() tiene dedup interno (type+title+message),
    // así que si por alguna razón se ejecuta 2 veces, no se duplica.
    if (stockCheckedFor.current !== tenantId) {
      stockCheckedFor.current = tenantId;
      checkLowStock(tenantId);
    }
    if (zeroStockCheckedFor.current !== tenantId) {
      zeroStockCheckedFor.current = tenantId;
      checkLowStockZero(tenantId);
    }
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

    // Alerta de tasa desactualizada — el usuario debe actualizarla manualmente
    subs.push(
      EventBus.on(SystemEvents.EXCHANGE_RATE_STALE, (payload: unknown) => {
        const data = payload as { hours?: number; level?: 1 | 2; source?: string | null };
        if (!data.hours || !data.level) return;

        const isCritical = data.level === 2;
        store.addNotification({
          type: isCritical ? 'tasa_stale_critical' : 'tasa_stale',
          title: isCritical ? 'Tasa muy desactualizada' : 'Tasa desactualizada',
          message: isCritical
            ? `La tasa BCV tiene ${data.hours}h sin actualizar. ACTUALÍZALA MANUALMENTE o tus precios están basados en datos viejos.`
            : `La tasa BCV tiene ${data.hours}h sin actualizar. Te recomendamos actualizarla.`,
          actionLabel: 'Actualizar ahora',
        });
      }),
    );

    // Alerta de tasa que falló al cargar — SIN TASA, los precios son 0
    subs.push(
      EventBus.on(SystemEvents.EXCHANGE_RATE_FAILED, () => {
        store.addNotification({
          type: 'tasa_failed',
          title: 'Tasa BCV no disponible',
          message: `No se pudo cargar la tasa del BCV. Ingrésala manualmente para que los precios funcionen.`,
          actionLabel: 'Ingresar tasa',
        });
      }),
    );

    // Re-evaluar stock bajo/agotado cuando se recibe una compra
    subs.push(
      EventBus.on('PURCHASE.RECEIVED', () => {
        if (!tenantId) return;
        useNotificationStore.getState().dismissByType('low_stock');
        useNotificationStore.getState().dismissByType('product_agotado');
        checkLowStock(tenantId);
        checkLowStockZero(tenantId);
      }),
    );

    // Re-evaluar cuando se actualiza inventario (ajuste manual, edición)
    subs.push(
      EventBus.on(SystemEvents.INVENTORY_UPDATED, () => {
        if (!tenantId) return;
        useNotificationStore.getState().dismissByType('low_stock');
        useNotificationStore.getState().dismissByType('product_agotado');
        checkLowStock(tenantId);
        checkLowStockZero(tenantId);
      }),
    );

    // Re-evaluar cuando se completa una producción
    subs.push(
      EventBus.on(SystemEvents.PRODUCTION_COMPLETED, () => {
        if (!tenantId) return;
        useNotificationStore.getState().dismissByType('low_stock');
        useNotificationStore.getState().dismissByType('product_agotado');
        checkLowStock(tenantId);
        checkLowStockZero(tenantId);
      }),
    );

    return () => subs.forEach((s) => EventBus.off(s));
  }, [tenantId, role]);
}
