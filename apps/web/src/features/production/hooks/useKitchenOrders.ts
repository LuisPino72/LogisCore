import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { useDebouncedCallback } from '../../../common/hooks/useDebouncedCallback';
import { getKitchenOrders, updateOrderStatus, revertOrderStatus } from '../../pos/services/saleService';
import { logger } from '../../../lib/logger';
import { getDb } from '../../../services/dexie/db';
import type { DexieSale, DexieSaleItem } from '../../../services/dexie/db';

export interface KitchenOrderView {
  id: string;
  orderNumber: string;
  customerName: string;
  items: Array<{ name: string; quantity: number; unit?: string }>;
  status: 'pedida' | 'preparacion' | 'lista';
  elapsed: string;
  orderType?: string;
  isUrgent?: boolean;
  kitchenNotes?: string;
  modified: boolean;
  createdAt: string;
}

function formatElapsed(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const totalSec = Math.max(0, Math.floor(diff / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function playBeep(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as Record<string, unknown>)['webkitAudioContext'];
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx() as AudioContext;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    const osc = audioCtx.createOscillator();
    osc.frequency.value = 800;
    osc.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch {
    /* AudioContext no soportado */
  }
}

export function useKitchenOrders(): {
  orders: KitchenOrderView[];
  pendingCount: number;
  preparingCount: number;
  readyCount: number;
  markAsPreparing: (id: string) => Promise<void>;
  markAsReady: (id: string) => Promise<void>;
  revertToPreparing: (id: string) => Promise<void>;
  loading: boolean;
  refresh: () => void;
  audioSuspended: boolean;
  resumeAudio: () => void;
} {
  const [rawOrders, setRawOrders] = useState<DexieSale[]>([]);
  const [itemsMap, setItemsMap] = useState<Map<string, DexieSaleItem[]>>(new Map());
  const [customerMap, setCustomerMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [elapsedTick, setElapsedTick] = useState(0);
  const [audioSuspended, setAudioSuspended] = useState(false);
  const prevOrderCount = useRef(0);
  const session = useAuthStore((s) => s.session);
  const tenantId = session?.tenantId;

  const loadOrders = useCallback(async (silent = false) => {
    if (!tenantId) return;
    if (!silent) setLoading(true);
    const result = await getKitchenOrders(tenantId);
    if (result.ok) {
      const newOrders = result.data;
      if (prevOrderCount.current > 0 && newOrders.length > prevOrderCount.current) {
        playBeep();
      }
      prevOrderCount.current = newOrders.length;
      setRawOrders(newOrders);

      const db = getDb();
      const saleIds = newOrders.map((o) => o.id);
      const customerIds = [...new Set(newOrders.map((o) => o.customerId).filter((id): id is string => !!id))];

      const [itemsResults, customers] = await Promise.all([
        Promise.all(saleIds.map((id) => db.saleItems.where('saleId').equals(id).toArray())),
        customerIds.length > 0
          ? Promise.all(customerIds.map((id) => db.customers.get(id)))
          : Promise.resolve([]),
      ]);

      const newItemsMap = new Map<string, DexieSaleItem[]>();
      saleIds.forEach((id, i) => newItemsMap.set(id, itemsResults[i]));
      setItemsMap(newItemsMap);

      const newCustomerMap = new Map<string, string>();
      customers.forEach((c) => { if (c) newCustomerMap.set(c.id, c.name); });
      setCustomerMap(newCustomerMap);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const refreshRaw = useDebouncedCallback(() => {
    loadOrders(true);
  }, 500, 1500);

  useEffect(() => {
    if (!tenantId) return;

    const subs = [
      EventBus.on(SystemEvents.ORDER_CREATED, refreshRaw),
      EventBus.on(SystemEvents.ORDER_STATUS_CHANGED, refreshRaw),
      EventBus.on(SystemEvents.ORDER_CANCELLED, refreshRaw),
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, (payload: unknown) => {
        const { table } = payload as { table?: string };
        if (!table || table === '*' || table === 'sales') {
          refreshRaw();
        }
      }),
    ];

    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, refreshRaw]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const orders = useMemo<KitchenOrderView[]>(() => {
    void elapsedTick;
    return rawOrders.map((sale) => {
      const saleItems = itemsMap.get(sale.id) ?? [];
      const items = saleItems.length > 0
        ? saleItems.map((i) => ({ name: i.productName, quantity: i.quantity, unit: i.unit }))
        : [];

      return {
        id: sale.id,
        orderNumber: sale.orderNumber ?? sale.id.slice(0, 8),
        customerName: customerMap.get(sale.customerId ?? '') ?? 'Cliente',
        items,
        status: sale.status as KitchenOrderView['status'],
        elapsed: formatElapsed(sale.createdAt),
        orderType: sale.orderType,
        isUrgent: sale.isUrgent,
        kitchenNotes: sale.kitchenNotes,
        modified: (sale.modificationCount ?? 0) > 0,
        createdAt: sale.createdAt,
      };
    });
  }, [rawOrders, itemsMap, customerMap, elapsedTick]);

  const pendingCount = useMemo(() => orders.filter((o) => o.status === 'pedida').length, [orders]);
  const preparingCount = useMemo(() => orders.filter((o) => o.status === 'preparacion').length, [orders]);
  const readyCount = useMemo(() => orders.filter((o) => o.status === 'lista').length, [orders]);

  const markAsPreparing = useCallback(async (id: string) => {
    const result = await updateOrderStatus(id, 'preparacion');
    if (!result.ok) {
      logger.error('useKitchenOrders', 'Failed to mark as preparing', result.error);
      return;
    }
    await loadOrders(true);
  }, [loadOrders]);

  const markAsReady = useCallback(async (id: string) => {
    const result = await updateOrderStatus(id, 'lista');
    if (!result.ok) {
      logger.error('useKitchenOrders', 'Failed to mark as ready', result.error);
      return;
    }
    await loadOrders(true);
  }, [loadOrders]);

  const revertToPreparing = useCallback(async (id: string) => {
    const result = await revertOrderStatus(id);
    if (!result.ok) {
      logger.error('useKitchenOrders', 'Failed to revert to preparing', result.error);
      return;
    }
    await loadOrders(true);
  }, [loadOrders]);

  const refresh = useCallback(() => {
    loadOrders(true);
  }, [loadOrders]);

  const resumeAudio = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as Record<string, unknown>)['webkitAudioContext'];
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => setAudioSuspended(false)).catch(() => {});
      } else {
        setAudioSuspended(false);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as Record<string, unknown>)['webkitAudioContext'];
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      setAudioSuspended(ctx.state === 'suspended');
      const handler = () => setAudioSuspended(ctx.state === 'suspended');
      ctx.addEventListener('statechange', handler);
      return () => ctx.removeEventListener('statechange', handler);
    } catch { /* ignore */ }
  }, []);

  return {
    orders,
    pendingCount,
    preparingCount,
    readyCount,
    markAsPreparing,
    markAsReady,
    revertToPreparing,
    loading,
    refresh,
    audioSuspended,
    resumeAudio,
  };
}
