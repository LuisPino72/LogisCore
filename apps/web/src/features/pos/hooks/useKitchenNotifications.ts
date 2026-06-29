import { useState, useEffect, useCallback } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { customerService } from '../../customers/services/customerService';
import { getSaleById } from '../services/saleService';
import { audioService } from '../../../services/audioService';

interface KitchenNotification {
  saleId: string;
  customerName: string;
  orderNumber: string;
}

interface UseKitchenNotificationsOptions {
  tenantId: string | null;
}

export function useKitchenNotifications({ tenantId }: UseKitchenNotificationsOptions) {
  const [kitchenReadyNotifs, setKitchenReadyNotifs] = useState<KitchenNotification[]>([]);

  const fetchOrderData = useCallback(async (saleId: string) => {
    const saleResult = await getSaleById(saleId);
    if (!saleResult.ok || !saleResult.data) return null;
    const sale = saleResult.data;
    let customerName = 'Cliente';
    if (sale.customerId && tenantId) {
      const custResult = await customerService.getCustomerById(sale.customerId, tenantId);
      if (custResult.ok && custResult.data) customerName = custResult.data.name;
    }
    return { sale, customerName };
  }, [tenantId]);

  useEffect(() => {
    const sub = EventBus.on(SystemEvents.ORDER_STATUS_CHANGED, (payload: unknown) => {
      const data = payload as { saleId?: string; newStatus?: string };
      if (data?.newStatus === 'lista' && data?.saleId) {
        fetchOrderData(data.saleId).then((info) => {
          if (!info) return;
          setKitchenReadyNotifs((prev) => {
            const next = [{ saleId: data.saleId!, customerName: info.customerName, orderNumber: info.sale.orderNumber ?? '' }, ...prev];
            return next.slice(0, 3);
          });

          audioService.kitchenReady();
        });
      }
    });
    return () => { EventBus.off(sub); };
  }, [fetchOrderData]);

  const dismissNotification = useCallback((saleId: string) => {
    setKitchenReadyNotifs((prev) => prev.filter((n) => n.saleId !== saleId));
  }, []);

  return { kitchenReadyNotifs, dismissNotification };
}
