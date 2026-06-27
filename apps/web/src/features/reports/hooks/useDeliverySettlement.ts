import { useState, useCallback, useEffect, useRef } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { getDeliverySettlement, markDeliverySettlementPaid, type DeliverySettlementRow } from '../services/deliverySettlementService';

interface DateRange {
  start: string;
  end: string;
}

function getTodayRange(): DateRange {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  return { start: `${today}T00:00:00`, end: `${today}T23:59:59` };
}

export function useDeliverySettlement(tenantId: string | null) {
  const [data, setData] = useState<DeliverySettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<DateRange>(getTodayRange);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    const result = await getDeliverySettlement(tenantId, date.start, date.end);
    if (!mountedRef.current) return;
    if (result.ok) {
      setData(result.data);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, [tenantId, date]);

  const paySettlement = useCallback(async (name: string, start: string, end: string) => {
    const tid = tenantId ?? '';
    const result = await markDeliverySettlementPaid(tid, name, start, end);
    if (!mountedRef.current) return result;
    if (result.ok) {
      await fetchData();
    } else {
      setError(result.error.message);
    }
    return result;
  }, [tenantId, fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const subs = [
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, (payload: unknown) => {
        const { table } = payload as { table?: string };
        if (table === '*' || table === 'sales') fetchData();
      }),
      EventBus.on(SystemEvents.ORDER_DELIVERED, fetchData),
    ];
    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, fetchData]);

  return { data, loading, error, date, setDate, refresh: fetchData, paySettlement };
}
