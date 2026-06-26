import { useState, useEffect, useCallback, useRef } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { activityService } from '../services/activityService';
import { useDebouncedCallback } from '../../../common/hooks/useDebouncedCallback';
import type { ActivityEntry } from '../types';

export function useRecentActivity(tenantId: string | null) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!tenantId || !mountedRef.current) return;
    setLoading(true);
    const result = await activityService.getRecentActivity(tenantId);
    if (result.ok && mountedRef.current) {
      setActivity(result.data ?? []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    refresh();
  }, [tenantId, refresh]);

  const debouncedRefresh = useDebouncedCallback(() => {
    refresh();
  }, 300, 1000);

  useEffect(() => {
    if (!tenantId) return;
    const subs = [
      EventBus.on(SystemEvents.SALE_COMPLETED, debouncedRefresh),
      EventBus.on(SystemEvents.EXPENSES_CREATED, debouncedRefresh),
      EventBus.on(SystemEvents.PURCHASE_RECEIVED, debouncedRefresh),
      EventBus.on(SystemEvents.SUPPLIER_PAYMENT_CREATED, debouncedRefresh),
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, debouncedRefresh),
      EventBus.on(SystemEvents.SALE_VOIDED, debouncedRefresh),
      EventBus.on(SystemEvents.PRODUCTION_COMPLETED, debouncedRefresh),
      EventBus.on(SystemEvents.CUSTOMER_CREATED, debouncedRefresh),
    ];
    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, debouncedRefresh]);

  return { activity, loading, refresh };
}
