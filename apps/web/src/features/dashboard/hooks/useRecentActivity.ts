import { useState, useEffect, useCallback } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { activityService } from '../services/activityService';
import type { ActivityEntry } from '../types';

export function useRecentActivity(tenantId: string | null) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const result = await activityService.getRecentActivity(tenantId);
    if (result.ok) {
      setActivity(result.data ?? []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    refresh();
  }, [tenantId, refresh]);

  useEffect(() => {
    if (!tenantId) return;
    const handler = () => { refresh(); };
    const subs = [
      EventBus.on(SystemEvents.SALE_COMPLETED, handler),
      EventBus.on(SystemEvents.EXPENSES_CREATED, handler),
      EventBus.on('PURCHASE.RECEIVED', handler),
      EventBus.on('PURCHASE.SUPPLIER_PAID', handler),
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, handler),
    ];
    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, refresh]);

  return { activity, loading, refresh };
}
