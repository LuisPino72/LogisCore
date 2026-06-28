import { useEffect, useRef } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useNotificationStore } from '../../../stores/notificationStore';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import { systemNotificationService } from '../services/systemNotificationService';
import { displayQty } from '../../inventory/types';

const HIGH_SALE_THRESHOLD_USD = 100;
const stockCheckPending = new Map<string, Promise<void>>();
const zeroStockCheckPending = new Map<string, Promise<void>>();

async function checkLowStock(tenantId: string): Promise<void> {
  try {
    const lowStock = await systemNotificationService.getLowStockProducts(tenantId);
    if (lowStock.length === 0) return;

    if (lowStock.length === 1) {
      const product = lowStock[0];
      await useNotificationStore.getState().addNotification({
        type: 'low_stock',
        title: 'Stock crítico',
        message: `${product.name} — ${displayQty(product.stock, product.unit)} (mín: ${displayQty(product.stockMin!, product.unit)})`,
        dedupKey: `low_stock|${product.id}`,
      });
    } else {
      const summary = lowStock
        .map((p) => `${p.name} (${displayQty(p.stock, p.unit)})`)
        .join(', ');
      await useNotificationStore.getState().addNotification({
        type: 'low_stock',
        title: 'Stock crítico',
        message: `${lowStock.length} productos con stock bajo: ${summary}`,
        dedupKey: 'low_stock_batch',
      });
    }
  } catch {
    // silencioso
  }
}

async function checkLowStockZero(tenantId: string): Promise<void> {
  try {
    const agotados = await systemNotificationService.getZeroStockProducts(tenantId);
    if (agotados.length === 0) return;

    if (agotados.length === 1) {
      const product = agotados[0];
      await useNotificationStore.getState().addNotification({
        type: 'product_agotado',
        title: 'Producto agotado',
        message: `${product.name} — sin stock disponible`,
        dedupKey: `product_agotado|${product.id}`,
      });
    } else {
      const summary = agotados.map((p) => p.name).join(', ');
      await useNotificationStore.getState().addNotification({
        type: 'product_agotado',
        title: 'Producto agotado',
        message: `${agotados.length} productos agotados: ${summary}`,
        dedupKey: 'product_agotado_batch',
      });
    }
  } catch {
    // silencioso
  }
}

async function checkLowStockDebounced(tenantId: string): Promise<void> {
  const existing = stockCheckPending.get(tenantId);
  if (existing) return existing;

  const promise = checkLowStock(tenantId).finally(() => {
    stockCheckPending.delete(tenantId);
  });
  stockCheckPending.set(tenantId, promise);
  return promise;
}

async function checkLowStockZeroDebounced(tenantId: string): Promise<void> {
  const existing = zeroStockCheckPending.get(tenantId);
  if (existing) return existing;

  const promise = checkLowStockZero(tenantId).finally(() => {
    zeroStockCheckPending.delete(tenantId);
  });
  zeroStockCheckPending.set(tenantId, promise);
  return promise;
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
      checkLowStockDebounced(tenantId);
    }
    if (zeroStockCheckedFor.current !== tenantId) {
      zeroStockCheckedFor.current = tenantId;
      checkLowStockZeroDebounced(tenantId);
    }
    checkOpenRegister(tenantId);

    const subs: ReturnType<typeof EventBus.on>[] = [];

    subs.push(
      EventBus.on(SystemEvents.SALE_VOIDED, (payload: unknown) => {
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
      EventBus.on(SystemEvents.PURCHASE_RECEIVED, async () => {
        if (!tenantId) return;
        await useNotificationStore.getState().dismissByType('low_stock');
        await useNotificationStore.getState().dismissByType('product_agotado');
        await checkLowStockDebounced(tenantId);
        await checkLowStockZeroDebounced(tenantId);
      }),
    );

    // Re-evaluar cuando se actualiza inventario (ajuste manual, edición)
    subs.push(
      EventBus.on(SystemEvents.INVENTORY_UPDATED, async () => {
        if (!tenantId) return;
        await useNotificationStore.getState().dismissByType('low_stock');
        await useNotificationStore.getState().dismissByType('product_agotado');
        await checkLowStockDebounced(tenantId);
        await checkLowStockZeroDebounced(tenantId);
      }),
    );

    // Re-evaluar cuando se completa una producción
    subs.push(
      EventBus.on(SystemEvents.PRODUCTION_COMPLETED, async () => {
        if (!tenantId) return;
        await useNotificationStore.getState().dismissByType('low_stock');
        await useNotificationStore.getState().dismissByType('product_agotado');
        await checkLowStockDebounced(tenantId);
        await checkLowStockZeroDebounced(tenantId);
      }),
    );

    return () => subs.forEach((s) => EventBus.off(s));
  }, [tenantId, role]);
}
